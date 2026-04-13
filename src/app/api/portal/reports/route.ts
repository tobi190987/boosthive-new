import { NextRequest, NextResponse } from 'next/server'
import { requirePortalUser } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * GET /api/portal/reports
 *
 * Returns reports that have been shared with the portal for the current customer.
 * Only exports with is_shared_with_portal = true and status = 'done' are returned.
 */
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requirePortalUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { customerId } = authResult.auth

  // Check visibility
  const admin = createAdminClient()
  const { data: vis } = await admin
    .from('client_portal_visibility')
    .select('show_reports')
    .eq('customer_id', customerId)
    .maybeSingle()

  if (vis && vis.show_reports === false) {
    return NextResponse.json({ reports: [] })
  }

  const { data: exports_, error } = await admin
    .from('exports')
    .select('id, file_name, storage_path, created_at, format, export_type')
    .eq('customer_id', customerId)
    .eq('tenant_id', tenantId)
    .eq('is_shared_with_portal', true)
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const reports = await Promise.all(
    (exports_ ?? []).map(async (exp: {
      id: string
      file_name: string | null
      storage_path: string | null
      created_at: string
      format: string
      export_type: string
    }) => {
      // Generate a short-lived signed URL for download
      let downloadUrl = ''
      if (exp.storage_path) {
        const { data: signed } = await admin.storage
          .from('exports')
          .createSignedUrl(exp.storage_path, 60 * 60) // 1 hour

        downloadUrl = signed?.signedUrl ?? ''
      }

      const title =
        exp.file_name?.replace(/\.[^/.]+$/, '') ??
        formatExportType(exp.export_type)

      return {
        id: exp.id,
        title,
        description: formatExportType(exp.export_type),
        created_at: exp.created_at,
        file_size_kb: null, // storage metadata not easily available without extra call
        download_url: downloadUrl,
      }
    })
  )

  return NextResponse.json({ reports })
}

function formatExportType(type: string): string {
  const map: Record<string, string> = {
    keyword_rankings: 'Keyword-Rankings',
    marketing_dashboard: 'Marketing-Dashboard',
    gsc_discovery: 'GSC Discovery',
    customer_report: 'Kunden-Report',
  }
  return map[type] ?? type
}
