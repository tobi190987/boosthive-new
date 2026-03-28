import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

const E2E_TOKEN = process.env.E2E_TEST_HELPER_TOKEN ?? 'local-e2e-token'

interface SeedBody {
  slug?: string
  status?: 'active' | 'inactive'
  subscriptionStatus?: string | null
  billingOnboardingCompleted?: boolean
}

function isAllowed(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  if (request.headers.get('x-e2e-token') !== E2E_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  return null
}

function isMissingRelationError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '42P01'
  )
}

function isMissingColumnError(error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : null
  const message =
    typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : null

  return (
    code === '42703' ||
    (code === 'PGRST204' && message?.includes('subscription_status')) ||
    (code === 'PGRST204' && message?.includes('billing_onboarding_completed_at')) ||
    message?.includes("Could not find the 'subscription_status' column") === true ||
    message?.includes("Could not find the 'billing_onboarding_completed_at' column") === true
  )
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null) {
    const message =
      'message' in error && typeof error.message === 'string' ? error.message : null
    const code = 'code' in error && typeof error.code === 'string' ? error.code : null
    const details = 'details' in error && typeof error.details === 'string' ? error.details : null
    const hint = 'hint' in error && typeof error.hint === 'string' ? error.hint : null

    return [message, code ? `code=${code}` : null, details, hint].filter(Boolean).join(' | ')
  }

  return 'E2E-Seeding konnte nicht abgeschlossen werden.'
}

async function findUserIdByEmail(email: string) {
  const supabaseAdmin = createAdminClient()
  const lookup = await supabaseAdmin.rpc('find_auth_user_by_email', {
    p_email: email,
  })

  if (lookup.error) {
    throw lookup.error
  }

  return lookup.data?.[0]?.id as string | undefined
}

async function ensureUser(email: string, password: string) {
  const supabaseAdmin = createAdminClient()
  const existingUserId = await findUserIdByEmail(email)

  if (existingUserId) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existingUserId, {
      email,
      password,
      email_confirm: true,
      user_metadata: {},
      app_metadata: {},
    })

    if (error) {
      throw error
    }

    return existingUserId
  }

  const result = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {},
    app_metadata: {},
  })

  if (result.error || !result.data.user) {
    throw result.error ?? new Error('E2E user could not be created.')
  }

  return result.data.user.id
}

async function deleteUserByEmail(email: string) {
  const supabaseAdmin = createAdminClient()
  const userId = await findUserIdByEmail(email)

  if (!userId) {
    return
  }

  await supabaseAdmin.from('user_profiles').delete().eq('user_id', userId)
  await supabaseAdmin.auth.admin.deleteUser(userId)
}

async function resetTenantState(tenantId: string) {
  const supabaseAdmin = createAdminClient()

  await supabaseAdmin.from('tenant_invitations').delete().eq('tenant_id', tenantId)
  await supabaseAdmin.from('password_reset_tokens').delete().eq('tenant_id', tenantId)
  const { error: auditCleanupError } = await supabaseAdmin
    .from('owner_audit_logs')
    .delete()
    .eq('tenant_id', tenantId)

  if (auditCleanupError && !isMissingRelationError(auditCleanupError)) {
    throw auditCleanupError
  }

  await supabaseAdmin.from('tenant_members').delete().eq('tenant_id', tenantId)
}

export async function POST(request: NextRequest) {
  const denied = isAllowed(request)
  if (denied) return denied

  try {
    let body: SeedBody | null = null
    try {
      body = (await request.json()) as SeedBody
    } catch {
      body = null
    }

    const slug = body?.slug?.trim()
    if (!slug) {
      return NextResponse.json({ error: 'slug is required.' }, { status: 400 })
    }

    const tenantStatus = body?.status === 'inactive' ? 'inactive' : 'active'
    const subscriptionStatus = body?.subscriptionStatus ?? 'inactive'
    const billingOnboardingCompleted = body?.billingOnboardingCompleted === true
    let subscriptionStatusAvailable = true

    const supabaseAdmin = createAdminClient()
    const tenantName = `E2E ${slug}`
    const ownerEmail = `owner+${slug}@example.com`
    const adminEmail = `admin+${slug}@example.com`
    const memberEmail = `member+${slug}@example.com`
    const inviteeEmail = `invitee+${slug}@example.com`
    const password = `Pw-${slug}-123!`

    const ownerUserId = await ensureUser(ownerEmail, password)
    const adminUserId = await ensureUser(adminEmail, password)
    const memberUserId = await ensureUser(memberEmail, password)
    await deleteUserByEmail(inviteeEmail)

    const { error: ownerUpsertError } = await supabaseAdmin
      .from('platform_admins')
      .upsert({ user_id: ownerUserId }, { onConflict: 'user_id' })

    if (ownerUpsertError) {
      throw ownerUpsertError
    }

    let tenantId: string
    const existingTenant = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (existingTenant.error) {
      throw existingTenant.error
    }

    if (existingTenant.data?.id) {
      tenantId = existingTenant.data.id
      let updateResult = await supabaseAdmin
        .from('tenants')
        .update({
          name: tenantName,
          status: tenantStatus,
          subscription_status: subscriptionStatus,
          logo_url: null,
          billing_company: null,
          billing_street: null,
          billing_zip: null,
          billing_city: null,
          billing_country: null,
          billing_vat_id: null,
          billing_onboarding_completed_at: billingOnboardingCompleted
            ? new Date().toISOString()
            : null,
        })
        .eq('id', tenantId)

      if (isMissingColumnError(updateResult.error)) {
        subscriptionStatusAvailable = false
        updateResult = await supabaseAdmin
          .from('tenants')
          .update({
            name: tenantName,
            status: tenantStatus,
            logo_url: null,
            billing_company: null,
            billing_street: null,
            billing_zip: null,
            billing_city: null,
            billing_country: null,
            billing_vat_id: null,
            billing_onboarding_completed_at: billingOnboardingCompleted
              ? new Date().toISOString()
              : null,
          })
          .eq('id', tenantId)
      }

      if (updateResult.error) {
        throw updateResult.error
      }
    } else {
      let createdTenant = await supabaseAdmin
        .from('tenants')
        .insert({
          slug,
          name: tenantName,
          status: tenantStatus,
          subscription_status: subscriptionStatus,
          billing_onboarding_completed_at: billingOnboardingCompleted
            ? new Date().toISOString()
            : null,
        })
        .select('id')
        .single()

      if (isMissingColumnError(createdTenant.error)) {
        subscriptionStatusAvailable = false
        createdTenant = await supabaseAdmin
          .from('tenants')
          .insert({
            slug,
            name: tenantName,
            status: tenantStatus,
            billing_onboarding_completed_at: billingOnboardingCompleted
              ? new Date().toISOString()
              : null,
          })
          .select('id')
          .single()
      }

      if (createdTenant.error || !createdTenant.data) {
        throw createdTenant.error ?? new Error('E2E tenant could not be created.')
      }

      tenantId = createdTenant.data.id
    }

    await resetTenantState(tenantId)

    const now = new Date().toISOString()
    const { error: membersError } = await supabaseAdmin.from('tenant_members').upsert(
      [
        {
          user_id: adminUserId,
          tenant_id: tenantId,
          role: 'admin',
          status: 'active',
          invited_at: now,
          joined_at: now,
          onboarding_completed_at: null,
        },
        {
          user_id: memberUserId,
          tenant_id: tenantId,
          role: 'member',
          status: 'active',
          invited_at: now,
          joined_at: now,
          onboarding_completed_at: null,
        },
      ],
      { onConflict: 'user_id,tenant_id' }
    )

    if (membersError) {
      throw membersError
    }

    const { error: profilesError } = await supabaseAdmin.from('user_profiles').upsert(
      [
        {
          user_id: adminUserId,
          first_name: null,
          last_name: null,
          avatar_url: null,
        },
        {
          user_id: memberUserId,
          first_name: null,
          last_name: null,
          avatar_url: null,
        },
      ],
      { onConflict: 'user_id' }
    )

    if (profilesError) {
      throw profilesError
    }

    return NextResponse.json({
      tenant: {
        id: tenantId,
        slug,
        name: tenantName,
      },
      capabilities: {
        subscriptionStatusAvailable,
      },
      users: {
        owner: { email: ownerEmail, password },
        admin: { email: adminEmail, password },
        member: { email: memberEmail, password },
      },
    })
  } catch (error) {
    console.error('[POST /api/test/e2e/seed] fehlgeschlagen:', error)
    return NextResponse.json(
      {
        error: errorMessage(error),
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const denied = isAllowed(request)
  if (denied) return denied

  let body: SeedBody | null = null
  try {
    body = (await request.json()) as SeedBody
  } catch {
    body = null
  }

  const slug = body?.slug?.trim()
  if (!slug) {
    return NextResponse.json({ error: 'slug is required.' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient()
  const tenantLookup = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (tenantLookup.error) {
    throw tenantLookup.error
  }

  const tenantId = tenantLookup.data?.id
  const ownerEmail = `owner+${slug}@example.com`
  const adminEmail = `admin+${slug}@example.com`
  const memberEmail = `member+${slug}@example.com`
  const ownerUserId = await findUserIdByEmail(ownerEmail)
  const userIds = (
    await Promise.all([findUserIdByEmail(adminEmail), findUserIdByEmail(memberEmail)])
  ).filter((value): value is string => Boolean(value))
  const inviteeEmail = `invitee+${slug}@example.com`
  const inviteeUserId = await findUserIdByEmail(inviteeEmail)
  const allUserIds = [...userIds, ...(inviteeUserId ? [inviteeUserId] : []), ...(ownerUserId ? [ownerUserId] : [])]

  if (tenantId) {
    await resetTenantState(tenantId)
    await supabaseAdmin.from('tenants').delete().eq('id', tenantId)
  }

  if (ownerUserId) {
    await supabaseAdmin.from('platform_admins').delete().eq('user_id', ownerUserId)
  }

  if (allUserIds.length > 0) {
    await supabaseAdmin.from('user_profiles').delete().in('user_id', allUserIds)
  }

  await Promise.all(allUserIds.map((userId) => supabaseAdmin.auth.admin.deleteUser(userId)))
  await deleteUserByEmail(inviteeEmail)

  return NextResponse.json({ success: true })
}
