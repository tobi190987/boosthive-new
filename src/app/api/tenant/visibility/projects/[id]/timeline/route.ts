import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { getProjectTimeline } from '@/lib/visibility-report'

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

  const { data: project } = await admin
    .from('visibility_projects')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (!project) {
    return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })
  }

  const timeline = await getProjectTimeline(tenantId, id)
  return NextResponse.json({ timeline })
}
