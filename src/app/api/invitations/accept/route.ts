import { NextRequest, NextResponse } from 'next/server'
import { logAudit, logOperationalError, logSecurity } from '@/lib/observability'
import { AcceptInvitationSchema } from '@/lib/schemas/invitations'
import { deriveInvitationStatus, hashInvitationToken } from '@/lib/invitations'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import { loadTenantStatusRecord, resolveTenantStatus } from '@/lib/tenant-status'
import { checkRateLimit, getClientIp, rateLimitResponse, AUTH_INVITE } from '@/lib/rate-limit'

const INVALID_TOKEN_ERROR =
  'Der Einladungslink ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.'

interface InvitationRecord {
  id: string
  email: string
  role: 'admin' | 'member'
  accepted_at: string | null
  revoked_at: string | null
  expires_at: string | null
  tenants: { name: string | null; slug: string | null } | { name: string | null; slug: string | null }[] | null
}

function tenantNameFromInvitation(invitation: InvitationRecord) {
  return Array.isArray(invitation.tenants)
    ? invitation.tenants[0]?.name ?? null
    : invitation.tenants?.name ?? null
}

export async function POST(request: NextRequest) {
  // Rate Limiting: 10 requests / 15 min / IP
  const ip = getClientIp(request)
  const rl = checkRateLimit(`auth-invite:${ip}`, AUTH_INVITE)
  if (!rl.allowed) {
    logSecurity('invitation_accept_rate_limited', { ip })
    return rateLimitResponse(rl)
  }

  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    logSecurity('invitation_accept_missing_tenant_header')
    return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = AcceptInvitationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const supabaseAdmin = createAdminClient()
  const tenantStatusLookup = await loadTenantStatusRecord(supabaseAdmin, { id: tenantId })
  const tenantStatus =
    tenantStatusLookup.data ? resolveTenantStatus(tenantStatusLookup.data) : null

  if (tenantStatusLookup.error || !tenantStatus || tenantStatus.effectiveStatus === 'archived') {
    logSecurity('invitation_accept_archived_tenant_blocked', {
      tenantId,
      tenantError:
        typeof tenantStatusLookup.error === 'object' &&
        tenantStatusLookup.error !== null &&
        'message' in tenantStatusLookup.error
          ? tenantStatusLookup.error.message
          : null,
    })
    return NextResponse.json(
      { error: 'Dieser Tenant ist archiviert. Einladungen können aktuell nicht angenommen werden.' },
      { status: 403 }
    )
  }

  const tokenHash = hashInvitationToken(parsed.data.token)
  const nowIso = new Date().toISOString()
  const { data: invitation, error: invitationError } = await supabaseAdmin
    .from('tenant_invitations')
    .select('id, email, role, accepted_at, revoked_at, expires_at, tenants(name, slug)')
    .eq('tenant_id', tenantId)
    .eq('token_hash', tokenHash)
    .maybeSingle<InvitationRecord>()

  if (invitationError) {
    logOperationalError('invitation_accept_load_failed', invitationError, {
      tenantId,
    })
    return NextResponse.json({ error: 'Einladung konnte nicht angenommen werden.' }, { status: 500 })
  }

  if (!invitation) {
    logSecurity('invitation_accept_invalid_token', { tenantId })
    return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 })
  }

  if (invitation.accepted_at) {
    return NextResponse.json({
      success: true,
      redirectTo: '/dashboard',
      tenantName: tenantNameFromInvitation(invitation),
    })
  }

  if (!invitation.email || !invitation.role) {
    return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 })
  }

  const invitationStatus = deriveInvitationStatus(invitation)
  if (invitationStatus !== 'pending') {
    logSecurity('invitation_accept_non_pending_token', {
      tenantId,
      invitationId: invitation.id,
      invitationStatus,
      email: invitation.email,
    })
    return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 })
  }

  const existingUserLookup = await supabaseAdmin.rpc('find_auth_user_by_email', {
    p_email: invitation.email,
  })

  if (existingUserLookup.error) {
    logOperationalError('invitation_accept_user_lookup_failed', existingUserLookup.error, {
      tenantId,
      invitationId: invitation.id,
      email: invitation.email,
    })
    return NextResponse.json({ error: 'Einladung konnte nicht angenommen werden.' }, { status: 500 })
  }

  const existingUser = existingUserLookup.data?.[0] ?? null

  if (existingUser?.id) {
    const { data: activeMembership, error: membershipError } = await supabaseAdmin
      .from('tenant_members')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', existingUser.id)
      .eq('status', 'active')
      .maybeSingle()

    if (membershipError) {
      logOperationalError('invitation_accept_membership_check_failed', membershipError, {
        tenantId,
        invitationId: invitation.id,
        existingUserId: existingUser.id,
      })
      return NextResponse.json({ error: 'Einladung konnte nicht angenommen werden.' }, { status: 500 })
    }

    if (activeMembership) {
      logSecurity('invitation_accept_existing_membership_conflict', {
        tenantId,
        invitationId: invitation.id,
        existingUserId: existingUser.id,
        email: invitation.email,
      })
      const name = tenantNameFromInvitation(invitation)
      return NextResponse.json(
        { error: `User ist bereits Mitglied von "${name ?? 'diesem Tenant'}".` },
        { status: 409 }
      )
    }
  }

  let userId = existingUser?.id as string | undefined

  if (existingUser?.id) {
    const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      password: parsed.data.password,
      email_confirm: true,
      app_metadata: {
        tenant_id: tenantId,
        role: invitation.role,
      },
    })

    if (updateUserError) {
      logOperationalError('invitation_accept_existing_user_update_failed', updateUserError, {
        tenantId,
        invitationId: invitation.id,
        userId: existingUser.id,
      })
      return NextResponse.json({ error: 'Einladung konnte nicht angenommen werden.' }, { status: 500 })
    }
  } else {
    const createUserResult = await supabaseAdmin.auth.admin.createUser({
      email: invitation.email,
      password: parsed.data.password,
      email_confirm: true,
      app_metadata: {
        tenant_id: tenantId,
        role: invitation.role,
      },
    })

    if (createUserResult.error || !createUserResult.data.user) {
      const retryLookup = await supabaseAdmin.rpc('find_auth_user_by_email', {
        p_email: invitation.email,
      })

      if (retryLookup.error || !retryLookup.data?.[0]?.id) {
        logOperationalError('invitation_accept_user_create_failed', createUserResult.error, {
          tenantId,
          invitationId: invitation.id,
          email: invitation.email,
        })
        return NextResponse.json({ error: 'Einladung konnte nicht angenommen werden.' }, { status: 500 })
      }

      userId = retryLookup.data[0].id
    } else {
      userId = createUserResult.data.user.id
    }
  }

  const { error: memberUpsertError } = await supabaseAdmin.from('tenant_members').upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      role: invitation.role,
      status: 'active',
      invited_at: nowIso,
      joined_at: nowIso,
    },
    {
      onConflict: 'user_id,tenant_id',
    }
  )

  if (memberUpsertError) {
    logOperationalError('invitation_accept_membership_upsert_failed', memberUpsertError, {
      tenantId,
      invitationId: invitation.id,
      userId,
    })
    return NextResponse.json({ error: 'Einladung konnte nicht angenommen werden.' }, { status: 500 })
  }

  const { error: invitationUpdateError } = await supabaseAdmin
    .from('tenant_invitations')
    .update({
      accepted_at: nowIso,
      accepted_user_id: userId,
    })
    .eq('tenant_id', tenantId)
    .eq('id', invitation.id)
    .is('accepted_at', null)
    .is('revoked_at', null)

  if (invitationUpdateError) {
    logOperationalError('invitation_accept_finalize_failed', invitationUpdateError, {
      tenantId,
      invitationId: invitation.id,
      userId,
    })
    const { data: finalizedInvitation, error: finalizedInvitationError } = await supabaseAdmin
      .from('tenant_invitations')
      .select('id, email, role, accepted_at, revoked_at, expires_at, tenants(name, slug)')
      .eq('tenant_id', tenantId)
      .eq('id', invitation.id)
      .maybeSingle<InvitationRecord>()

    if (finalizedInvitationError) {
      logOperationalError('invitation_accept_finalize_reload_failed', finalizedInvitationError, {
        tenantId,
        invitationId: invitation.id,
        userId,
      })
      return NextResponse.json({ error: 'Einladung konnte nicht angenommen werden.' }, { status: 500 })
    }

    if (!finalizedInvitation?.accepted_at) {
      return NextResponse.json({ error: 'Einladung konnte nicht angenommen werden.' }, { status: 500 })
    }
  }

  const supabase = await createClient()
  await supabase.auth.signOut()

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: invitation.email,
    password: parsed.data.password,
  })

  if (signInError) {
    logOperationalError('invitation_accept_auto_login_failed', signInError, {
      tenantId,
      invitationId: invitation.id,
      userId,
      email: invitation.email,
    })
    return NextResponse.json(
      { error: 'Einladung angenommen, aber der Auto-Login ist fehlgeschlagen.' },
      { status: 500 }
    )
  }

  const { error: claimUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userId!, {
    app_metadata: { tenant_id: tenantId, role: invitation.role },
  })

  if (claimUpdateError) {
    logOperationalError('invitation_accept_claim_update_failed', claimUpdateError, {
      tenantId,
      invitationId: invitation.id,
      userId,
      role: invitation.role,
    })
    await supabase.auth.signOut()
    return NextResponse.json(
      { error: 'Einladung angenommen, aber die Sitzung konnte nicht vorbereitet werden.' },
      { status: 500 }
    )
  }

  const { error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) {
    logOperationalError('invitation_accept_session_refresh_failed', refreshError, {
      tenantId,
      invitationId: invitation.id,
      userId,
      role: invitation.role,
    })
    await supabase.auth.signOut()
    return NextResponse.json(
      { error: 'Einladung angenommen, aber die Sitzung konnte nicht aktualisiert werden.' },
      { status: 500 }
    )
  }

  logAudit('invitation_accepted', {
    tenantId,
    invitationId: invitation.id,
    userId,
    email: invitation.email,
    role: invitation.role,
  })
  return NextResponse.json({
    success: true,
    redirectTo: '/dashboard',
    tenantName: tenantNameFromInvitation(invitation),
  })
}
