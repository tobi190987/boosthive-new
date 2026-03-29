/**
 * PROJ-26: DELETE /api/tenant/keywords/projects/[id]/gsc/disconnect
 *
 * Removes the GSC connection for the project (deletes tokens from DB).
 * Note: Does not revoke the token with Google (user must do that in Google Account settings).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_WRITE } from '@/lib/rate-limit'

const paramsSchema = z.object({
  id: z.string().uuid('Ungueltige Projekt-ID.'),
})

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`gsc-disconnect:${tenantId}:${getClientIp(request)}`, GSC_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.issues[0]?.message }, { status: 400 })
  }

  const { id: projectId } = parsedParams.data

  const admin = createAdminClient()

  // Verify connection exists before deleting
  const { data: conn } = await admin
    .from('gsc_connections')
    .select('id')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!conn) {
    return NextResponse.json({ error: 'Keine GSC-Verbindung fuer dieses Projekt.' }, { status: 404 })
  }

  const { error } = await admin
    .from('gsc_connections')
    .delete()
    .eq('id', conn.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({})
}
