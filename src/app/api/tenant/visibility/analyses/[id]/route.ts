import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'

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
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('visibility_analyses')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Analyse nicht gefunden.' }, { status: 404 })
  }

  // Include raw results if the analysis is completed
  if (data.status === 'done') {
    const { data: rawResults } = await admin
      .from('visibility_raw_results')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('analysis_id', id)
      .order('created_at', { ascending: true })
      .limit(5000)

    return NextResponse.json({ ...data, raw_results: rawResults ?? [] })
  }

  return NextResponse.json(data)
}

export async function DELETE(
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
  const admin = createAdminClient()

  const { data: analysis } = await admin
    .from('visibility_analyses')
    .select('status')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (!analysis) return NextResponse.json({ error: 'Analyse nicht gefunden.' }, { status: 404 })

  if (analysis.status === 'done' || analysis.status === 'failed' || analysis.status === 'cancelled') {
    return NextResponse.json(
      { error: 'Bereits abgeschlossene Analysen können nicht abgebrochen werden.' },
      { status: 400 }
    )
  }

  const { error } = await admin
    .from('visibility_analyses')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
