import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * GET /api/owner/dashboard
 * Aggregierte Kennzahlen fuer das Owner-Dashboard.
 */
export async function GET() {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const supabaseAdmin = createAdminClient()

  const [
    { count: totalTenants, error: totalTenantsError },
    { count: activeTenants, error: activeTenantsError },
    { count: inactiveTenants, error: inactiveTenantsError },
    { data: activeMembers, error: activeMembersError },
  ] = await Promise.all([
    supabaseAdmin.from('tenants').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabaseAdmin.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'inactive'),
    supabaseAdmin
      .from('tenant_members')
      .select('user_id')
      .eq('status', 'active'),
  ])

  const error =
    totalTenantsError || activeTenantsError || inactiveTenantsError || activeMembersError

  if (error) {
    console.error('[GET /api/owner/dashboard] Aggregationsfehler:', error)
    return NextResponse.json(
      { error: 'Dashboard-Metriken konnten nicht geladen werden.' },
      { status: 500 }
    )
  }

  const totalUsers = new Set((activeMembers ?? []).map((member) => member.user_id)).size

  return NextResponse.json({
    metrics: {
      totalTenants: totalTenants ?? 0,
      activeTenants: activeTenants ?? 0,
      inactiveTenants: inactiveTenants ?? 0,
      totalUsers: totalUsers ?? 0,
    },
  })
}
