import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * GET /api/portal/branding
 *
 * Public endpoint — returns portal branding for the current tenant.
 * Used by the login page to display the agency logo and colors
 * before the user is authenticated.
 */
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({
      branding: { agencyName: 'Kundenportal', logoUrl: null, primaryColor: '#3b82f6' },
    })
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('client_portal_settings')
    .select('portal_logo_url, primary_color, agency_name')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return NextResponse.json({
    branding: {
      agencyName: data?.agency_name ?? 'Kundenportal',
      logoUrl: data?.portal_logo_url ?? null,
      primaryColor: data?.primary_color ?? '#3b82f6',
    },
  })
}
