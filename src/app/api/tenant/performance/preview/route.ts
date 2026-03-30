import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { parseCSV, applyFilters } from '@/lib/performance/csv-parser'
import type { Filters } from '@/lib/performance/types'

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_performance')
  if ('error' in moduleAccess) return moduleAccess.error

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Keine Datei gefunden' }, { status: 400 })

    const content = await file.text()
    const { rows, meta } = parseCSV(content)

    let filtersRaw: Filters = { active_only: false, campaigns: [] }
    const filtersStr = formData.get('filters')
    if (filtersStr) {
      try { filtersRaw = JSON.parse(String(filtersStr)) } catch { /* ignore */ }
    }

    const { rows: filteredRows, applied } = applyFilters(rows, filtersRaw, meta.entity_column)

    return NextResponse.json({
      preview: {
        platform: meta.platform,
        entity_label: meta.entity_label,
        entity_column: meta.entity_column,
        analysis_level: meta.analysis_level,
        data_kind: meta.data_kind,
        columns: meta.columns,
        rows_total: meta.rows,
        rows_filtered: filteredRows.length,
        rows: filteredRows.slice(0, 5),
        kpis: meta.kpis,
        date_range: meta.date_range,
        campaigns_all: meta.campaigns_all,
        campaigns_total: meta.campaigns_total,
        has_status: meta.has_status,
        status_values: meta.status_values,
        filters_applied: applied,
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' }, { status: 400 })
  }
}
