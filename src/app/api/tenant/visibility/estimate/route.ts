import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { checkRateLimit, getClientIp, rateLimitResponse, VISIBILITY_ESTIMATE } from '@/lib/rate-limit'

const estimateSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1).max(10),
  models: z.array(z.string().min(1)).min(1),
  iterations: z.number().int().min(5).max(10),
  competitor_count: z.number().int().min(0).max(3).optional().default(0),
})

// Average cost per query across OpenRouter models (approximation)
const COST_PER_QUERY = 0.001

// Estimated seconds per query (sequential processing with network latency)
const SECONDS_PER_QUERY = 3

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`visibility-estimate:${tenantId}:${getClientIp(request)}`, VISIBILITY_ESTIMATE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_visibility')
  if ('error' in moduleAccess) return moduleAccess.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltiger JSON-Body.' }, { status: 400 })
  }

  const parsed = estimateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { keywords, models, iterations, competitor_count } = parsed.data
  const subjects = 1 + competitor_count // brand + competitors
  const totalQueries = keywords.length * models.length * iterations * subjects
  const estimatedCost = totalQueries * COST_PER_QUERY
  const estimatedDurationMinutes = Math.ceil((totalQueries * SECONDS_PER_QUERY) / 60)

  return NextResponse.json({
    total_queries: totalQueries,
    estimated_cost: Math.round(estimatedCost * 10000) / 10000,
    estimated_duration_minutes: estimatedDurationMinutes,
    breakdown: {
      keywords: keywords.length,
      models: models.length,
      iterations,
      subjects,
    },
  })
}
