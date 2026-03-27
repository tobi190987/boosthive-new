import { NextRequest, NextResponse } from 'next/server'
import { AcceptInvitationSchema } from '@/lib/schemas/invitations'
import { deriveInvitationStatus, hashInvitationToken } from '@/lib/invitations'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

const INVALID_TOKEN_ERROR =
  'Der Einladungslink ist ungueltig oder abgelaufen. Bitte fordere einen neuen Link an.'

interface InvitationRecord {
  id: string
  email: string
  role: 'admin' | 'member'
  claimed_at: string | null
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
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltiger JSON-Body.' }, { status: 400 })
  }

  const parsed = AcceptInvitationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const supabaseAdmin = createAdminClient()
  const tokenHash = hashInvitationToken(parsed.data.token)
  const nowIso = new Date().toISOString()

  const { data: claimedInvitation, error: claimError } = await supabaseAdmin
    .from('tenant_invitations')
    .update({ claimed_at: nowIso })
    .eq('tenant_id', tenantId)
    .eq('token_hash', tokenHash)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .is('claimed_at', null)
    .gt('expires_at', nowIso)
    .select('id, email, role, claimed_at, accepted_at, revoked_at, expires_at, tenants(name, slug)')
    .maybeSingle<InvitationRecord>()

  if (claimError) {
    console.error('[POST /api/invitations/accept] Einladung konnte nicht geclaimt werden:', claimError)
    return NextResponse.json({ error: 'Einladung konnte nicht angenommen werden.' }, { status: 500 })
  }

  let invitation = claimedInvitation

  if (!invitation) {
    const { data: existingInvitation, error: invitationError } = await supabaseAdmin
      .from('tenant_invitations')
      .select('id, email, role, claimed_at, accepted_at, revoked_at, expires_at, tenants(name, slug)')
      .eq('tenant_id', tenantId)
      .eq('token_hash', tokenHash)
      .maybeSingle<InvitationRecord>()

    if (invitationError) {
      console.error(
        '[POST /api/invitations/accept] Einladung konnte nicht geladen werden:',
        invitationError
      )
      return NextResponse.json({ error: 'Einladung konnte nicht angenommen werden.' }, { status: 500 })
    }

    if (!existingInvitation) {
      return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 })
    }

    if (existingInvitation.accepted_at) {
      return NextResponse.json({
        success: true,
        redirectTo: '/dashboard',
        tenantName: tenantNameFromInvitation(existingInvitation),
      })
    }

    if (existingInvitation.claimed_at) {
      return NextResponse.json(
        { error: 'Diese Einladung wird bereits verarbeitet. Bitte einen Moment warten.' },
        { status: 409 }
      )
    }

    return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 })
  }

  const rollbackClaim = async () => {
    const { error } = await supabaseAdmin
      .from('tenant_invitations')
      .update({ claimed_at: null })
      .eq('tenant_id', tenantId)
      .eq('id', invitation.id)
      .is('accepted_at', null)
      .is('revoked_at', null)

    if (error) {
      console.error('[POST /api/invitations/accept] Claim-Rollback fehlgeschlagen:', error)
    }
  }

  if (!invitation.email || !invitation.role) {
    await rollbackClaim()
    return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 })
  }

  const invitationStatus = deriveInvitationStatus(invitation)
  if (invitationStatus !== 'pending') {
    await rollbackClaim()
    return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 })
  }

  const existingUserLookup = await supabaseAdmin.rpc('find_auth_user_by_email', {
    p_email: invitation.email,
  })

  if (existingUserLookup.error) {
    console.error('[POST /api/invitations/accept] User-Lookup fehlgeschlagen:', existingUserLookup.error)
    await rollbackClaim()
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
      console.error('[POST /api/invitations/accept] Membership-Pruefung fehlgeschlagen:', membershipError)
      await rollbackClaim()
      return NextResponse.json({ error: 'Einladung konnte nicht angenommen werden.' }, { status: 500 })
    }

    if (activeMembership) {
      await rollbackClaim()
      return NextResponse.json(
        { error: 'User ist bereits Mitglied in diesem Tenant.' },
        { status: 409 }
      )
    }
  }

  let userId = existingUser?.id as string | undefined

  if (existingUser?.id) {
    const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        display_name: parsed.data.name,
      },
      app_metadata: {
        tenant_id: tenantId,
        role: invitation.role,
      },
    })

    if (updateUserError) {
      console.error('[POST /api/invitations/accept] User-Update fehlgeschlagen:', updateUserError)
      await rollbackClaim()
      return NextResponse.json({ error: 'Einladung konnte nicht angenommen werden.' }, { status: 500 })
    }
  } else {
    const createUserResult = await supabaseAdmin.auth.admin.createUser({
      email: invitation.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        display_name: parsed.data.name,
      },
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
        console.error('[POST /api/invitations/accept] User-Anlage fehlgeschlagen:', createUserResult.error)
        await rollbackClaim()
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
    console.error('[POST /api/invitations/accept] Membership-Upsert fehlgeschlagen:', memberUpsertError)
    await rollbackClaim()
    return NextResponse.json({ error: 'Einladung konnte nicht angenommen werden.' }, { status: 500 })
  }

  const { error: invitationUpdateError } = await supabaseAdmin
    .from('tenant_invitations')
    .update({
      claimed_at: nowIso,
      accepted_at: nowIso,
      accepted_user_id: userId,
      accepted_name: parsed.data.name,
    })
    .eq('tenant_id', tenantId)
    .eq('id', invitation.id)
    .is('accepted_at', null)
    .is('revoked_at', null)

  if (invitationUpdateError) {
    console.error('[POST /api/invitations/accept] Einladung konnte nicht finalisiert werden:', invitationUpdateError)
    await rollbackClaim()
    return NextResponse.json({ error: 'Einladung konnte nicht angenommen werden.' }, { status: 500 })
  }

  const supabase = await createClient()
  await supabase.auth.signOut()

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: invitation.email,
    password: parsed.data.password,
  })

  if (signInError) {
    console.error('[POST /api/invitations/accept] Auto-Login fehlgeschlagen:', signInError)
    return NextResponse.json(
      { error: 'Einladung angenommen, aber der Auto-Login ist fehlgeschlagen.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    redirectTo: '/dashboard',
    tenantName: tenantNameFromInvitation(invitation),
  })
}
