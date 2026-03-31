import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Vergleich nicht gefunden.' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('seo_comparisons')
    .select('id, own_url, competitor_urls, results, created_at, customer_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Vergleich nicht gefunden.' }, { status: 404 })
  }

  return NextResponse.json({
    id: data.id,
    ownUrl: data.own_url,
    competitorUrls: data.competitor_urls,
    results: data.results,
    createdAt: data.created_at,
    customerId: data.customer_id,
  })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Vergleich nicht gefunden.' }, { status: 404 })
  }

  const admin = createAdminClient()
  // Check existence first so DELETE on non-existent ID returns 404
  const { data: existing } = await admin
    .from('seo_comparisons')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Vergleich nicht gefunden.' }, { status: 404 })
  }

  const { error } = await admin
    .from('seo_comparisons')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
