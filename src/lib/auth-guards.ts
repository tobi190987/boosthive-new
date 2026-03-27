import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export type AppRole = 'owner' | 'admin' | 'member'

export interface AuthContext {
  userId: string
  role: AppRole
  tenantId: string | null
}

/**
 * Prueft ob der aktuelle Request von einem User mit einer der erlaubten Rollen kommt.
 * Liest Rolle aus JWT app_metadata (wird beim Login gesetzt).
 *
 * Gibt bei Erfolg den AuthContext zurueck.
 * Gibt bei Fehler eine NextResponse mit 401/403 zurueck.
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
 * Prueft ob der aktuelle Request von einem Tenant-Admin kommt,
 * dessen JWT-Tenant mit dem Tenant-Header des Requests uebereinstimmt.
 *
 * Verhindert Cross-Tenant-Angriffe: Admin von Tenant A kann nicht
 * Members von Tenant B verwalten.
 */
export async function requireTenantAdmin(
  tenantIdFromHeader: string
): Promise<{ auth: AuthContext } | { error: NextResponse }> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      error: NextResponse.json(
        { error: 'Nicht authentifiziert. Bitte einloggen.' },
        { status: 401 }
      ),
    }
  }

  const { data: membership } = await supabase
    .from('tenant_members')
    .select('tenant_id, role, status')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantIdFromHeader)
    .eq('status', 'active')
    .maybeSingle()

  if (!membership || membership.role !== 'admin') {
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
      role: 'admin',
      tenantId: membership.tenant_id,
    },
  }
}
