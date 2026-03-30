/**
 * PROJ-26: GET /api/tenant/keywords/projects/[id]/gsc/status
 *
 * Returns the current GSC connection for the project (or null if not connected).
 * Never returns encrypted tokens.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_READ } from '@/lib/rate-limit'

const paramsSchema = z.object({
  id: z.string().uuid('Ungültige Projekt-ID.'),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`gsc-status:${tenantId}:${getClientIp(request)}`, GSC_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.issues[0]?.message }, { status: 400 })
  }

  const { id: projectId } = parsedParams.data

  const admin = createAdminClient()
  const { data } = await admin
    .from('gsc_connections')
    .select('id, google_email, selected_property, status, connected_at, token_expires_at')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ connection: null })
  }

  return NextResponse.json({
    connection: {
      id: data.id,
      google_email: data.google_email,
      selected_property: data.selected_property,
      status: data.status,
      connected_at: data.connected_at,
      token_expires_at: data.token_expires_at,
    },
  })
}
