import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import { loadTenantStatusRecord, resolveTenantStatus } from '@/lib/tenant-status'
import { logSecurity } from '@/lib/observability'

export type AppRole = 'owner' | 'admin' | 'member'

export interface AuthContext {
  userId: string
  role: AppRole
  tenantId: string | null
}

type CachedValue<T> = {
  expiresAt: number
  value: T
}

type CachedMembership = {
  tenant_id: string
  role: AppRole
  status: string
} | null

type CachedTenantStatus = ReturnType<typeof resolveTenantStatus> | null

const AUTH_CACHE_TTL_MS = 10_000
const AUTH_CACHE_MAX_ENTRIES = 500
const membershipCache = new Map<string, CachedValue<CachedMembership>>()
const tenantStatusCache = new Map<string, CachedValue<CachedTenantStatus>>()

function readCache<T>(store: Map<string, CachedValue<T>>, key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined

  if (entry.expiresAt <= Date.now()) {
    store.delete(key)
    return undefined
  }

  return entry.value
}

function writeCache<T>(store: Map<string, CachedValue<T>>, key: string, value: T) {
  if (store.size >= AUTH_CACHE_MAX_ENTRIES) {
    const now = Date.now()
    for (const [entryKey, entry] of store.entries()) {
      if (entry.expiresAt <= now) {
        store.delete(entryKey)
      }
    }

    if (store.size >= AUTH_CACHE_MAX_ENTRIES) {
      const oldestKey = store.keys().next().value
      if (oldestKey) {
        store.delete(oldestKey)
      }
    }
  }

  store.set(key, {
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
    value,
  })
}

async function loadActiveMembership(
  tenantId: string,
  userId: string
): Promise<CachedMembership> {
  const cacheKey = `${tenantId}:${userId}`
  const cached = readCache(membershipCache, cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('tenant_members')
    .select('tenant_id, role, status')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()

  const normalizedMembership = membership
    ? {
        tenant_id: membership.tenant_id,
        role: membership.role as AppRole,
        status: membership.status,
      }
    : null

  writeCache(membershipCache, cacheKey, normalizedMembership)
  return normalizedMembership
}

async function loadResolvedTenantStatus(tenantId: string): Promise<CachedTenantStatus> {
  const cached = readCache(tenantStatusCache, tenantId)
  if (cached !== undefined) {
    return cached
  }

  const admin = createAdminClient()
  const tenantStatusResult = await loadTenantStatusRecord(admin, { id: tenantId })
  const tenantStatus = tenantStatusResult.data ? resolveTenantStatus(tenantStatusResult.data) : null

  if (!tenantStatusResult.error) {
    writeCache(tenantStatusCache, tenantId, tenantStatus)
  }

  return tenantStatus
}

export async function requireTenantUser(
  tenantIdFromHeader: string
): Promise<{ auth: AuthContext } | { error: NextResponse }> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    logSecurity('tenant_user_access_unauthenticated', {
      tenantId: tenantIdFromHeader,
      authError: authError?.message ?? null,
    })
    return {
      error: NextResponse.json(
        { error: 'Nicht authentifiziert. Bitte einloggen.' },
        { status: 401 }
      ),
    }
  }

  const [membership, tenantStatus] = await Promise.all([
    loadActiveMembership(tenantIdFromHeader, user.id),
    loadResolvedTenantStatus(tenantIdFromHeader),
  ])

  if (!membership) {
    logSecurity('tenant_user_access_forbidden', {
      userId: user.id,
      tenantId: tenantIdFromHeader,
    })
    return {
      error: NextResponse.json(
        { error: 'Zugriff verweigert. Keine aktive Tenant-Mitgliedschaft.' },
        { status: 403 }
      ),
    }
  }

  if (!tenantStatus || tenantStatus.blocksProtectedAppAccess) {
    logSecurity('tenant_user_access_blocked_tenant_status', {
      userId: user.id,
      tenantId: tenantIdFromHeader,
      effectiveStatus: tenantStatus?.effectiveStatus ?? null,
    })
    return {
      error: NextResponse.json(
        { error: 'Tenant ist archiviert oder aktuell gesperrt.' },
        { status: 403 }
      ),
    }
  }

  return {
    auth: {
      userId: user.id,
      role: membership.role as AppRole,
      tenantId: membership.tenant_id,
    },
  }
}

/**
 * Prüft ob der aktuelle Request von einem User mit einer der erlaubten Rollen kommt.
 * Liest Rolle aus JWT app_metadata (wird beim Login gesetzt).
 *
 * Gibt bei Erfolg den AuthContext zurück.
 * Gibt bei Fehler eine NextResponse mit 401/403 zurück.
 */
export async function requireRole(
  allowedRoles: AppRole[]
): Promise<{ auth: AuthContext } | { error: NextResponse }> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    logSecurity('role_access_unauthenticated', {
      allowedRoles,
      authError: authError?.message ?? null,
    })
    return {
      error: NextResponse.json(
        { error: 'Nicht authentifiziert. Bitte einloggen.' },
        { status: 401 }
      ),
    }
  }

  let role: AppRole | null = null
  let tenantId: string | null = null

  if (allowedRoles.includes('owner')) {
    const { data: admin } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (admin) {
      role = 'owner'
    }
  }

  if (!role && (allowedRoles.includes('admin') || allowedRoles.includes('member'))) {
    const claimedTenantId = (user.app_metadata?.tenant_id as string | null | undefined) ?? null

    if (claimedTenantId) {
      const { data: membership } = await supabase
        .from('tenant_members')
        .select('tenant_id, role, status')
        .eq('user_id', user.id)
        .eq('tenant_id', claimedTenantId)
        .eq('status', 'active')
        .maybeSingle()

      if (membership) {
        role = membership.role as AppRole
        tenantId = membership.tenant_id
      }
    }
  }

  if (!role || !allowedRoles.includes(role)) {
    logSecurity('role_access_forbidden', {
      userId: user.id,
      resolvedRole: role,
      allowedRoles,
    })
    return {
      error: NextResponse.json(
        { error: 'Zugriff verweigert. Unzureichende Berechtigung.' },
        { status: 403 }
      ),
    }
  }

  return {
    auth: {
      userId: user.id,
      role,
      tenantId,
    },
  }
}

/**
 * Prüft ob der aktuelle Request von einem Tenant-Admin kommt,
 * dessen JWT-Tenant mit dem Tenant-Header des Requests übereinstimmt.
 *
 * Verhindert Cross-Tenant-Angriffe: Admin von Tenant A kann nicht
 * Members von Tenant B verwalten.
 */
export async function requireTenantAdmin(
  tenantIdFromHeader: string
): Promise<{ auth: AuthContext } | { error: NextResponse }> {
  const authResult = await requireTenantUser(tenantIdFromHeader)
  if ('error' in authResult) {
    return authResult
  }

  if (authResult.auth.role !== 'admin') {
    logSecurity('tenant_admin_access_forbidden', {
      userId: authResult.auth.userId,
      tenantId: tenantIdFromHeader,
      actualRole: authResult.auth.role,
    })
    return {
      error: NextResponse.json(
        { error: 'Zugriff verweigert. Unzureichende Berechtigung.' },
        { status: 403 }
      ),
    }
  }

  return {
    auth: authResult.auth,
  }
}
