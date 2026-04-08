'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'

type AppRole = 'owner' | 'admin' | 'member' | null

interface UseRoleResult {
  role: AppRole
  tenantId: string | null
  loading: boolean
  isOwner: boolean
  isAdmin: boolean
  isMember: boolean
  /** true für admin UND owner */
  hasAdminAccess: boolean
}

/**
 * Client-seitiger Hook zum Lesen der Rolle des eingeloggten Users.
 *
 * WICHTIG: Nur für UX (Navigation, Buttons ausblenden).
 * Sicherheits-relevante Checks IMMER serverseitig in API-Routen oder Middleware.
 */
export function useRole(): UseRoleResult {
  const [role, setRole] = useState<AppRole>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createBrowserClient()

    supabase.auth.getSession().then(({ data: { session } }) => {
      const r = (session?.user?.app_metadata?.role as AppRole) ?? null
      const t = (session?.user?.app_metadata?.tenant_id as string | null) ?? null
      setRole(r)
      setTenantId(t)
      setLoading(false)
    })
  }, [])

  return {
    role,
    tenantId,
    loading,
    isOwner: role === 'owner',
    isAdmin: role === 'admin',
    isMember: role === 'member',
    hasAdminAccess: role === 'admin' || role === 'owner',
  }
}
