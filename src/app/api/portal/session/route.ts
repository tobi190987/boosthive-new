import { NextRequest, NextResponse } from 'next/server'
import { requirePortalUser } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * GET /api/portal/session
 *
 * Returns the current portal session: customer name, tenant branding,
 * and visibility settings. Used by PortalAuthenticatedPage to initialize
 * the shell before rendering any portal page.
 */
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requirePortalUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { customerId } = authResult.auth
  const admin = createAdminClient()

  // Load all needed data in parallel
  const [customerResult, settingsResult, visibilityResult] = await Promise.all([
    admin
      .from('customers')
      .select('name')
      .eq('id', customerId)
      .is('deleted_at', null)
      .single(),
    admin
      .from('client_portal_settings')
      .select('portal_logo_url, primary_color, agency_name')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    admin
      .from('client_portal_visibility')
      .select('show_ga4, show_ads, show_seo, show_reports')
      .eq('customer_id', customerId)
      .maybeSingle(),
  ])

  if (customerResult.error || !customerResult.data) {
    return NextResponse.json({ error: 'Kundendaten nicht gefunden.' }, { status: 404 })
  }

  const settings = settingsResult.data
  const vis = visibilityResult.data

  return NextResponse.json({
    customerName: customerResult.data.name as string,
    branding: {
      agencyName: settings?.agency_name ?? 'Kundenportal',
      logoUrl: settings?.portal_logo_url ?? null,
      primaryColor: settings?.primary_color ?? '#3b82f6',
    },
    visibility: {
      show_ga4: vis?.show_ga4 ?? true,
      show_ads: vis?.show_ads ?? true,
      show_seo: vis?.show_seo ?? true,
      show_reports: vis?.show_reports ?? true,
    },
  })
}
