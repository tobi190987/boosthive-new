import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { getRankingsDashboard } from '@/lib/keyword-rankings'
import { checkRateLimit, getClientIp, rateLimitResponse, VISIBILITY_READ } from '@/lib/rate-limit'

const paramsSchema = z.object({
  id: z.string().uuid('Ungueltige Projekt-ID.'),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`kw-rankings-read:${tenantId}:${getClientIp(request)}`, VISIBILITY_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.issues[0]?.message }, { status: 400 })
  }

  try {
    const data = await getRankingsDashboard(tenantId, parsedParams.data.id)
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ranking-Dashboard konnte nicht geladen werden.'
    const status = message === 'Projekt nicht gefunden.' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
