import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { checkRateLimit, getClientIp, rateLimitResponse, VISIBILITY_PROJECT_WRITE, VISIBILITY_READ } from '@/lib/rate-limit'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cId: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`kw-competitors-write:${tenantId}:${getClientIp(request)}`, VISIBILITY_PROJECT_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id: projectId, cId } = await params
  const admin = createAdminClient()

  const { error, count } = await admin
    .from('competitor_domains')
    .delete({ count: 'exact' })
    .eq('id', cId)
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Wettbewerber nicht gefunden.' }, { status: 404 })

  return NextResponse.json({})
}
