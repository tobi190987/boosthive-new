import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; kwId: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'keyword_tracking')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id: projectId, kwId } = await params
  const admin = createAdminClient()

  const { error, count } = await admin
    .from('keywords')
    .delete({ count: 'exact' })
    .eq('id', kwId)
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Keyword nicht gefunden.' }, { status: 404 })

  return NextResponse.json({})
}
