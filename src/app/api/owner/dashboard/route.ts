import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { hasMissingTenantStatusColumnError, resolveTenantStatus } from '@/lib/tenant-status'

/**
 * GET /api/owner/dashboard
 * Aggregierte Kennzahlen für das Owner-Dashboard.
 */
export async function GET() {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const supabaseAdmin = createAdminClient()

  const [{ data: activeMembers, error: activeMembersError }] = await Promise.all([
    supabaseAdmin
      .from('tenant_members')
      .select('user_id')
      .eq('status', 'active'),
  ])

  let tenantsResult = await supabaseAdmin
    .from('tenants')
    .select('id, status, subscription_status, billing_onboarding_completed_at, archived_at')

  if (hasMissingTenantStatusColumnError(tenantsResult.error, 'subscription_status')) {
    tenantsResult = await supabaseAdmin
      .from('tenants')
      .select('id, status, billing_onboarding_completed_at, archived_at')
  }

  if (hasMissingTenantStatusColumnError(tenantsResult.error, 'billing_onboarding_completed_at')) {
    tenantsResult = await supabaseAdmin
      .from('tenants')
      .select('id, status, archived_at')
  }

  if (hasMissingTenantStatusColumnError(tenantsResult.error, 'archived_at')) {
    tenantsResult = await supabaseAdmin
      .from('tenants')
      .select('id, status')
  }

  const { data: tenants, error: tenantsError } = tenantsResult

  const error = tenantsError || activeMembersError

  if (error) {
    console.error('[GET /api/owner/dashboard] Aggregationsfehler:', error)
    return NextResponse.json(
      { error: 'Dashboard-Metriken konnten nicht geladen werden.' },
      { status: 500 }
    )
  }

  const resolvedTenants = (tenants ?? []).map((tenant) => resolveTenantStatus(tenant))
  const totalTenants = resolvedTenants.length
  const activeTenants = resolvedTenants.filter((tenant) => tenant.effectiveStatus === 'active').length
  const inactiveTenants = resolvedTenants.filter((tenant) => tenant.effectiveStatus !== 'active').length
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
