import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { buildTenantUrl, overrideActionLinkRedirect, sendWelcome } from '@/lib/email'
import { requireOwner } from '@/lib/owner-auth'
import { AssignTenantAdminSchema } from '@/lib/schemas/tenant'
import { createAdminClient } from '@/lib/supabase-admin'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string) {
  return UUID_REGEX.test(value)
}

function normalizedDisplayName(email: string) {
  return email.split('@')[0] ?? email
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Ungültige Tenant-ID.' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = AssignTenantAdminSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const supabaseAdmin = createAdminClient()

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug')
    .eq('id', id)
    .maybeSingle()

  if (tenantError) {
    console.error('[POST /api/owner/tenants/[id]/admin] Tenant-Lookup fehlgeschlagen:', tenantError)
    return NextResponse.json({ error: 'Tenant konnte nicht geladen werden.' }, { status: 500 })
  }

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  const email = parsed.data.email.trim().toLowerCase()

  const { data: currentAdminMembership, error: currentAdminMembershipError } = await supabaseAdmin
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', id)
    .eq('role', 'admin')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (currentAdminMembershipError) {
    console.error(
      '[POST /api/owner/tenants/[id]/admin] Aktueller Admin konnte nicht geladen werden:',
      currentAdminMembershipError
    )
    return NextResponse.json({ error: 'Admin-Wechsel konnte nicht vorbereitet werden.' }, { status: 500 })
  }

  const existingUserLookup = await supabaseAdmin.rpc('find_auth_user_by_email', {
    p_email: email,
  })

  if (existingUserLookup.error) {
    console.error(
      '[POST /api/owner/tenants/[id]/admin] User-Lookup fehlgeschlagen:',
      existingUserLookup.error
    )
    return NextResponse.json({ error: 'Admin-Wechsel konnte nicht vorbereitet werden.' }, { status: 500 })
  }

  const existingUser = existingUserLookup.data?.[0] ?? null
  let newAdminUserId: string | null = existingUser?.id ?? null
  let createdUserId: string | null = null

  if (existingUser?.id) {
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('tenant_members')
      .select('id, role, status')
      .eq('tenant_id', id)
      .eq('user_id', existingUser.id)
      .maybeSingle()

    if (membershipError) {
      console.error(
        '[POST /api/owner/tenants/[id]/admin] Membership-Prüfung fehlgeschlagen:',
        membershipError
      )
      return NextResponse.json({ error: 'Admin-Wechsel konnte nicht vorbereitet werden.' }, { status: 500 })
    }

    if (!membership) {
      return NextResponse.json(
        {
          error:
            'Diese E-Mail existiert bereits bei einem anderen Tenant. Bitte eine neue E-Mail verwenden oder den User zuerst in diesen Tenant aufnehmen.',
        },
        { status: 409 }
      )
    }

    if (
      currentAdminMembership?.user_id &&
      currentAdminMembership.user_id === existingUser.id &&
      membership.role === 'admin' &&
      membership.status === 'active'
    ) {
      return NextResponse.json(
        { error: 'Diese Person ist bereits der aktuelle Admin dieses Tenants.' },
        { status: 409 }
      )
    }
  } else {
    const randomPassword = crypto.randomBytes(32).toString('base64url')
    const createUserResult = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: false,
      app_metadata: {
        tenant_id: id,
        role: 'admin',
      },
    })

    if (createUserResult.error || !createUserResult.data.user) {
      console.error(
        '[POST /api/owner/tenants/[id]/admin] User-Erstellung fehlgeschlagen:',
        createUserResult.error
      )
      return NextResponse.json({ error: 'Neuer Admin-User konnte nicht erstellt werden.' }, { status: 500 })
    }

    createdUserId = createUserResult.data.user.id
    newAdminUserId = createUserResult.data.user.id
  }

  const { data: assignmentData, error: assignmentError } = await supabaseAdmin.rpc(
    'assign_tenant_admin',
    {
      p_tenant_id: id,
      p_new_admin_user_id: newAdminUserId,
    }
  )

  if (assignmentError) {
    console.error('[POST /api/owner/tenants/[id]/admin] RPC-Fehler:', assignmentError)

    if (createdUserId) {
      const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(createdUserId)
      if (rollbackError) {
        console.error(
          '[POST /api/owner/tenants/[id]/admin] User-Rollback fehlgeschlagen:',
          rollbackError
        )
      }
    }

    return NextResponse.json({ error: 'Admin-Wechsel konnte nicht gespeichert werden.' }, { status: 500 })
  }

  if (!newAdminUserId) {
    return NextResponse.json({ error: 'Admin-Wechsel konnte nicht gespeichert werden.' }, { status: 500 })
  }

  const previousAdminUserId =
    Array.isArray(assignmentData) && assignmentData[0]?.previous_admin_user_id
      ? String(assignmentData[0].previous_admin_user_id)
      : currentAdminMembership?.user_id ?? null

  const { error: newAdminClaimError } = await supabaseAdmin.auth.admin.updateUserById(
    newAdminUserId,
    {
      app_metadata: {
        tenant_id: id,
        role: 'admin',
      },
    }
  )

  if (newAdminClaimError) {
    console.error(
      '[POST /api/owner/tenants/[id]/admin] Claim-Update für neuen Admin fehlgeschlagen:',
      newAdminClaimError
    )
  }

  if (previousAdminUserId && previousAdminUserId !== newAdminUserId) {
    const { error: previousAdminClaimError } = await supabaseAdmin.auth.admin.updateUserById(
      previousAdminUserId,
      {
        app_metadata: {
          tenant_id: id,
          role: 'member',
        },
      }
    )

    if (previousAdminClaimError) {
      console.error(
        '[POST /api/owner/tenants/[id]/admin] Claim-Update für bisherigen Admin fehlgeschlagen:',
        previousAdminClaimError
      )
    }
  }

  if (createdUserId) {
    const redirectTo = buildTenantUrl(tenant.slug, '/reset-password')
    const { data: recoveryLinkData, error: recoveryLinkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
          redirectTo,
        },
      })

    if (recoveryLinkError) {
      console.error(
        '[POST /api/owner/tenants/[id]/admin] Recovery-Link für neuen Admin fehlgeschlagen:',
        recoveryLinkError
      )
    } else {
      const actionLink = overrideActionLinkRedirect(
        recoveryLinkData.properties.action_link,
        redirectTo
      )
      const setupUrl = `${buildTenantUrl(tenant.slug, '/api/auth/email-link')}?link=${encodeURIComponent(actionLink)}`

      void sendWelcome({
        to: email,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        setupUrl,
      }).catch((error) => {
        console.error('[POST /api/owner/tenants/[id]/admin] E-Mail-Versand fehlgeschlagen:', error)
      })
    }
  }

  return NextResponse.json({
    success: true,
    currentAdmin: {
      id: newAdminUserId,
      name: normalizedDisplayName(email),
      email,
    },
  })
}
