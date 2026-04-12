import { cache } from 'react'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

const MODULE_ACCESS_ALIASES: Record<string, string[]> = {
  keyword_tracking: ['keyword_tracking', 'seo_analyse'],
}

/**
 * PROJ-15: Server-side module access guard.
 * Checks if a tenant has an active (or canceling) subscription for a specific module.
 * Status 'canceling' grants access until current_period_end.
 *
 * Usage in API routes:
 *   const access = await requireTenantModuleAccess(tenantId, 'seo_analyse')
 *   if ('error' in access) return access.error
 */
export async function requireTenantModuleAccess(
  tenantId: string,
  moduleCode: string
): Promise<{ granted: true } | { error: NextResponse }> {
  // DEV: all modules unlocked for all tenants
  return { granted: true }

  const supabaseAdmin = createAdminClient()
  const eligibleCodes = MODULE_ACCESS_ALIASES[moduleCode] ?? [moduleCode]

  // Look up matching modules by code, including access aliases for merged features.
  const { data: mods, error: modError } = await supabaseAdmin
    .from('modules')
    .select('id')
    .in('code', eligibleCodes)

  if (modError || !mods || (mods as Array<{ id: string }>).length === 0) {
    return {
      error: NextResponse.json(
        { error: 'Modul nicht gefunden.' },
        { status: 404 }
      ),
    }
  }

  const moduleIds = (mods as Array<{ id: string }>).map((mod) => mod.id)

  // Check the tenant's booking for any module that grants access.
  const { data: bookings, error: bookingError } = await supabaseAdmin
    .from('tenant_modules')
    .select('status, current_period_end')
    .eq('tenant_id', tenantId)
    .in('module_id', moduleIds)
 
  const booking = bookings?.find((entry) => entry.status === 'active')
    ?? bookings?.find((entry) => entry.status === 'canceling')

  if (bookingError || !booking) {
    return {
      error: NextResponse.json(
        { error: 'Dieses Modul ist nicht gebucht. Bitte buche es im Billing-Bereich.' },
        { status: 403 }
      ),
    }
  }

  const activeBooking = booking!
  if (activeBooking.status === 'active') {
    return { granted: true }
  }

  if (activeBooking.status === 'canceling') {
    // Still accessible until period end
    if (activeBooking.current_period_end) {
      const periodEnd = new Date(activeBooking.current_period_end)
      if (periodEnd > new Date()) {
        return { granted: true }
      }
    }
    return {
      error: NextResponse.json(
        { error: 'Das Modul-Abo ist abgelaufen.' },
        { status: 403 }
      ),
    }
  }

  return {
    error: NextResponse.json(
      { error: 'Dieses Modul ist nicht gebucht. Bitte buche es im Billing-Bereich.' },
      { status: 403 }
    ),
  }
}

// Modules temporarily unlocked for all tenants (preview/beta access)
const PREVIEW_MODULES = ['content_briefs', 'budget_tracking', 'social_calendar']

/**
 * Returns a list of active module codes for a tenant.
 * Useful for dashboard feature-gating without individual checks.
 */
export const getActiveModuleCodes = cache(async (tenantId: string): Promise<string[]> => {
  // DEV: all modules unlocked for all tenants (matches requireTenantModuleAccess behaviour)
  const supabaseAdmin = createAdminClient()
  const { data: allMods } = await supabaseAdmin.from('modules').select('code')
  return [...new Set([...(allMods?.map((m) => m.code) ?? []), ...PREVIEW_MODULES])]
})
