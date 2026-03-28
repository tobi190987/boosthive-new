import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  VISIBILITY_PROJECT_WRITE,
  VISIBILITY_READ,
} from '@/lib/rate-limit'

const createProjectSchema = z.object({
  brand_name: z.string().min(1, 'Brand-Name ist erforderlich.').max(200),
  website_url: z.string().url('Ungueltige URL.').max(500).nullable().optional(),
  competitors: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        url: z.string().max(500).optional().default(''),
      })
    )
    .max(3, 'Maximal 3 Wettbewerber.')
    .optional()
    .default([]),
  keywords: z
    .array(z.string().min(1).max(300))
    .min(1, 'Mindestens 1 Keyword wird benoetigt.')
    .max(10, 'Maximal 10 Keywords.'),
})

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`visibility-projects-read:${tenantId}:${getClientIp(request)}`, VISIBILITY_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_visibility')
  if ('error' in moduleAccess) return moduleAccess.error

  const admin = createAdminClient()

  // Fetch projects with latest analysis status and analysis count via subqueries
  const { data: projects, error } = await admin
    .from('visibility_projects')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!projects || projects.length === 0) {
    return NextResponse.json({ projects: [] })
  }

  // Enrich with latest analysis status + count in a single query
  const projectIds = projects.map((p) => p.id)

  const { data: analyses } = await admin
    .from('visibility_analyses')
    .select('id, project_id, status, created_at')
    .eq('tenant_id', tenantId)
    .in('project_id', projectIds)
    .order('created_at', { ascending: false })

  // Build lookup maps
  const latestByProject: Record<string, { status: string; created_at: string }> = {}
  const countByProject: Record<string, number> = {}

  for (const a of analyses ?? []) {
    countByProject[a.project_id] = (countByProject[a.project_id] ?? 0) + 1
    if (!latestByProject[a.project_id]) {
      latestByProject[a.project_id] = { status: a.status, created_at: a.created_at }
    }
  }

  const enriched = projects.map((p) => ({
    ...p,
    latest_analysis_status: latestByProject[p.id]?.status ?? null,
    latest_analysis_at: latestByProject[p.id]?.created_at ?? null,
    analysis_count: countByProject[p.id] ?? 0,
  }))

  return NextResponse.json({ projects: enriched })
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(
    `visibility-projects-write:${tenantId}:${getClientIp(request)}`,
    VISIBILITY_PROJECT_WRITE
  )
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

  const parsed = createProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { brand_name, website_url, competitors, keywords } = parsed.data

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('visibility_projects')
    .insert({
      tenant_id: tenantId,
      created_by: authResult.auth.userId,
      brand_name: brand_name.trim(),
      website_url: website_url ?? null,
      competitors,
      keywords: keywords.map((k) => k.trim()),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ project: data }, { status: 201 })
}
