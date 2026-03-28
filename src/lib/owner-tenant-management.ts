import type { SupabaseClient } from '@supabase/supabase-js'

export interface OwnerTenantUserRecord {
  memberId: string
  userId: string
  email: string | null
  name: string | null
  role: 'admin' | 'member'
  status: 'active' | 'inactive'
  invitedAt: string | null
  joinedAt: string | null
}

function displayNameFromUser(user: {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}) {
  const metadataName =
    typeof user.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name
      : typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : null

  if (metadataName && metadataName.trim().length > 0) {
    return metadataName.trim()
  }

  return user.email?.split('@')[0] ?? null
}

async function isPlatformOwner(supabaseAdmin: SupabaseClient, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return Boolean(data)
}

async function hasOtherMemberships(
  supabaseAdmin: SupabaseClient,
  userId: string,
  excludedTenantId?: string
) {
  let query = supabaseAdmin
    .from('tenant_members')
    .select('id')
    .eq('user_id', userId)
    .limit(1)

  if (excludedTenantId) {
    query = query.neq('tenant_id', excludedTenantId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw error
  }

  return Boolean(data)
}

async function deleteTenantInvitationsForUser(
  supabaseAdmin: SupabaseClient,
  tenantId: string,
  userId: string,
  email: string | null
) {
  const { error: acceptedUserDeleteError } = await supabaseAdmin
    .from('tenant_invitations')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('accepted_user_id', userId)

  if (acceptedUserDeleteError) {
    throw acceptedUserDeleteError
  }

  if (!email) {
    return
  }

  const { error: emailDeleteError } = await supabaseAdmin
    .from('tenant_invitations')
    .delete()
    .eq('tenant_id', tenantId)
    .ilike('email', email)

  if (emailDeleteError) {
    throw emailDeleteError
  }
}

export async function listTenantUsers(
  supabaseAdmin: SupabaseClient,
  tenantId: string
): Promise<OwnerTenantUserRecord[]> {
  const { data: memberships, error: membershipsError } = await supabaseAdmin
    .from('tenant_members')
    .select('id, user_id, role, status, invited_at, joined_at')
    .eq('tenant_id', tenantId)
    .order('role', { ascending: true })
    .order('invited_at', { ascending: true })

  if (membershipsError) {
    throw membershipsError
  }

  const users = await Promise.all(
    (memberships ?? []).map(async (membership) => {
      const { data: userResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(
        membership.user_id
      )

      if (userError || !userResult?.user) {
        console.error(
          `[owner-tenant-management] Auth-User ${membership.user_id} konnte nicht geladen werden:`,
          userError
        )

        return {
          memberId: membership.id,
          userId: membership.user_id,
          email: null,
          name: null,
          role: membership.role,
          status: membership.status,
          invitedAt: membership.invited_at,
          joinedAt: membership.joined_at,
        } satisfies OwnerTenantUserRecord
      }

      return {
        memberId: membership.id,
        userId: membership.user_id,
        email: userResult.user.email ?? null,
        name: displayNameFromUser(userResult.user),
        role: membership.role,
        status: membership.status,
        invitedAt: membership.invited_at,
        joinedAt: membership.joined_at,
      } satisfies OwnerTenantUserRecord
    })
  )

  return users
}

export async function deleteTenantUserForOwner(
  supabaseAdmin: SupabaseClient,
  tenantId: string,
  userId: string
) {
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('tenant_members')
    .select('id, role, status')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()

  if (membershipError) {
    throw membershipError
  }

  if (!membership) {
    return { deleted: false as const, reason: 'not_found' as const }
  }

  if (membership.role === 'admin' && membership.status === 'active') {
    const { count, error: adminCountError } = await supabaseAdmin
      .from('tenant_members')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('role', 'admin')
      .eq('status', 'active')

    if (adminCountError) {
      throw adminCountError
    }

    if ((count ?? 0) <= 1) {
      return { deleted: false as const, reason: 'last_admin' as const }
    }
  }

  const { data: userResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (userError) {
    throw userError
  }

  const userEmail = userResult.user?.email ?? null

  await deleteTenantInvitationsForUser(supabaseAdmin, tenantId, userId, userEmail)

  const { error: memberDeleteError } = await supabaseAdmin
    .from('tenant_members')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)

  if (memberDeleteError) {
    throw memberDeleteError
  }

  const [stillOwner, stillHasOtherMemberships] = await Promise.all([
    isPlatformOwner(supabaseAdmin, userId),
    hasOtherMemberships(supabaseAdmin, userId),
  ])

  let authDeleted = false

  if (!stillOwner && !stillHasOtherMemberships) {
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (authDeleteError) {
      throw authDeleteError
    }

    authDeleted = true
  }

  return {
    deleted: true as const,
    authDeleted,
  }
}

export async function deleteTenantForOwner(supabaseAdmin: SupabaseClient, tenantId: string) {
  const { data: memberships, error: membershipsError } = await supabaseAdmin
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', tenantId)

  if (membershipsError) {
    throw membershipsError
  }

  const userIds = [...new Set((memberships ?? []).map((membership) => membership.user_id))]

  const { data: deletedTenant, error: tenantDeleteError } = await supabaseAdmin
    .from('tenants')
    .delete()
    .eq('id', tenantId)
    .select('id, name, slug')
    .maybeSingle()

  if (tenantDeleteError) {
    throw tenantDeleteError
  }

  if (!deletedTenant) {
    return { deleted: false as const, reason: 'not_found' as const }
  }

  const cleanupErrors: string[] = []
  let deletedAuthUsers = 0

  for (const userId of userIds) {
    try {
      const [stillOwner, stillHasOtherMemberships] = await Promise.all([
        isPlatformOwner(supabaseAdmin, userId),
        hasOtherMemberships(supabaseAdmin, userId),
      ])

      if (stillOwner || stillHasOtherMemberships) {
        continue
      }

      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

      if (authDeleteError) {
        cleanupErrors.push(`${userId}: ${authDeleteError.message}`)
        continue
      }

      deletedAuthUsers += 1
    } catch (error) {
      cleanupErrors.push(`${userId}: ${error instanceof Error ? error.message : 'cleanup_failed'}`)
    }
  }

  return {
    deleted: true as const,
    tenant: deletedTenant,
    deletedAuthUsers,
    cleanupErrors,
  }
}
