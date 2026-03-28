import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

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
  const supabaseAdmin = createAdminClient()

  // Look up the module by code
  const { data: mod, error: modError } = await supabaseAdmin
    .from('modules')
    .select('id')
    .eq('code', moduleCode)
    .maybeSingle()

  if (modError || !mod) {
    return {
      error: NextResponse.json(
        { error: 'Modul nicht gefunden.' },
        { status: 404 }
      ),
    }
  }

  // Check tenant's booking for this module
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('tenant_modules')
    .select('status, current_period_end')
    .eq('tenant_id', tenantId)
    .eq('module_id', mod.id)
    .maybeSingle()

  if (bookingError || !booking) {
    return {
      error: NextResponse.json(
        { error: 'Dieses Modul ist nicht gebucht. Bitte buche es im Billing-Bereich.' },
        { status: 403 }
      ),
    }
  }

  if (booking.status === 'active') {
    return { granted: true }
  }

  if (booking.status === 'canceling') {
    // Still accessible until period end
    if (booking.current_period_end) {
      const periodEnd = new Date(booking.current_period_end)
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

/**
 * Returns a list of active module codes for a tenant.
 * Useful for dashboard feature-gating without individual checks.
 */
export async function getActiveModuleCodes(tenantId: string): Promise<string[]> {
  const supabaseAdmin = createAdminClient()

  const { data: bookings, error } = await supabaseAdmin
    .from('tenant_modules')
    .select('module_id, status, current_period_end, modules!inner(code)')
    .eq('tenant_id', tenantId)
    .in('status', ['active', 'canceling'])

  if (error || !bookings) return []

  const now = new Date()
  return bookings
    .filter((b) => {
      if (b.status === 'active') return true
      if (b.status === 'canceling' && b.current_period_end) {
        return new Date(b.current_period_end) > now
      }
      return false
    })
    .map((b) => {
      const modules = b.modules as unknown as { code: string }
      return modules.code
    })
}
