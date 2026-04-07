import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'

const DATA_TABLES = [
  // Approval & Notifications (vor ad_generations/content_briefs löschen wegen FK)
  'approval_requests',
  'notifications',
  // Content & Ads
  'ad_library_assets',
  'ad_generations',
  'content_briefs',
  // AI Performance
  'performance_analyses',
  // SEO
  'seo_comparisons',
  'seo_analyses',
  // AI Visibility (cascades zu analyses, raw_results, scores, sources, recommendations)
  'visibility_projects',
  // Keyword Projects (cascades zu keywords, competitor_domains, gsc_connections, runs, snapshots)
  'keyword_projects',
  // Kunden (cascades zu customer_integrations, customer_documents)
  'customers',
] as const

export async function DELETE(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const admin = createAdminClient()
  const deletedCounts: Record<string, number> = {}

  for (const table of DATA_TABLES) {
    const { count, error } = await admin
      .from(table)
      .delete({ count: 'exact' })
      .eq('tenant_id', tenantId)

    if (error) {
      return NextResponse.json(
        { error: `Fehler beim Löschen von ${table}: ${error.message}` },
        { status: 500 }
      )
    }

    if ((count ?? 0) > 0) {
      deletedCounts[table] = count ?? 0
    }
  }

  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_delete',
    resourceType: 'all_tenant_data',
    context: { deleted_counts: deletedCounts },
  })

  return NextResponse.json({ success: true, deleted_counts: deletedCounts })
}
