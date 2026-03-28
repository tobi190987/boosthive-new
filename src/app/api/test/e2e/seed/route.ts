import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

const E2E_TOKEN = process.env.E2E_TEST_HELPER_TOKEN ?? 'local-e2e-token'

interface SeedBody {
  slug?: string
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

export async function POST(request: NextRequest) {
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
  const tenantName = `E2E ${slug}`
  const adminEmail = `admin+${slug}@example.com`
  const memberEmail = `member+${slug}@example.com`
  const password = `Pw-${slug}-123!`

  const adminUserId = await ensureUser(adminEmail, password)
  const memberUserId = await ensureUser(memberEmail, password)

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
    const { error } = await supabaseAdmin
      .from('tenants')
      .update({
        name: tenantName,
        status: 'active',
        logo_url: null,
        billing_company: null,
        billing_street: null,
        billing_zip: null,
        billing_city: null,
        billing_country: null,
        billing_vat_id: null,
        billing_onboarding_completed_at: null,
      })
      .eq('id', tenantId)

    if (error) {
      throw error
    }
  } else {
    const createdTenant = await supabaseAdmin
      .from('tenants')
      .insert({
        slug,
        name: tenantName,
        status: 'active',
      })
      .select('id')
      .single()

    if (createdTenant.error || !createdTenant.data) {
      throw createdTenant.error ?? new Error('E2E tenant could not be created.')
    }

    tenantId = createdTenant.data.id
  }

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

  await supabaseAdmin
    .from('tenant_invitations')
    .delete()
    .eq('tenant_id', tenantId)

  return NextResponse.json({
    tenant: {
      id: tenantId,
      slug,
      name: tenantName,
    },
    users: {
      admin: { email: adminEmail, password },
      member: { email: memberEmail, password },
    },
  })
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
  const adminEmail = `admin+${slug}@example.com`
  const memberEmail = `member+${slug}@example.com`
  const userIds = (await Promise.all([findUserIdByEmail(adminEmail), findUserIdByEmail(memberEmail)])).filter(
    (value): value is string => Boolean(value)
  )
  const inviteeEmail = `invitee+${slug}@example.com`
  const inviteeUserId = await findUserIdByEmail(inviteeEmail)
  const allUserIds = [...userIds, ...(inviteeUserId ? [inviteeUserId] : [])]

  if (tenantId) {
    await supabaseAdmin.from('tenant_invitations').delete().eq('tenant_id', tenantId)
    await supabaseAdmin.from('password_reset_tokens').delete().eq('tenant_id', tenantId)
    await supabaseAdmin.from('tenant_members').delete().eq('tenant_id', tenantId)
    await supabaseAdmin.from('tenants').delete().eq('id', tenantId)
  }

  if (allUserIds.length > 0) {
    await supabaseAdmin.from('user_profiles').delete().in('user_id', allUserIds)
  }

  await Promise.all(allUserIds.map((userId) => supabaseAdmin.auth.admin.deleteUser(userId)))
  await deleteUserByEmail(inviteeEmail)

  return NextResponse.json({ success: true })
}
