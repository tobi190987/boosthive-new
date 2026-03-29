import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { buildReportPdf, getReportPayload } from '@/lib/visibility-report'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_visibility')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params

  let payload
  try {
    payload = await getReportPayload(tenantId, id)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reportdaten konnten nicht geladen werden.'
    return NextResponse.json({ error: message }, { status: 404 })
  }

  if (payload.analysis.status !== 'done') {
    return NextResponse.json({ error: 'Report ist erst nach abgeschlossener Analyse verfuegbar.' }, { status: 409 })
  }

  if (payload.analysis.analytics_status !== 'done' && payload.analysis.analytics_status !== 'partial') {
    return NextResponse.json(
      { error: 'Report ist erst nach abgeschlossener Analytics-Berechnung verfuegbar.' },
      { status: 409 }
    )
  }

  const pdf = buildReportPdf(payload)
  const dateLabel = new Date(payload.analysis.completed_at ?? payload.analysis.created_at)
    .toISOString()
    .slice(0, 10)
  const safeBrandName = payload.project.brand_name.replace(/[^a-zA-Z0-9-_]+/g, '-')
  const filename = `${safeBrandName}-AI-Visibility-Report-${dateLabel}.pdf`

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
