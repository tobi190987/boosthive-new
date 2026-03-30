import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { getProjectReportSummaryMap } from '@/lib/visibility-report'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  VISIBILITY_PROJECT_WRITE,
  VISIBILITY_READ,
} from '@/lib/rate-limit'

function normalizeUrl(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const createProjectSchema = z.object({
  brand_name: z.string().trim().min(1, 'Brand-Name ist erforderlich.').max(200),
  website_url: z
    .union([z.string().trim().max(500), z.null(), z.undefined()])
    .transform((value) => normalizeUrl(value))
    .refine((value) => value === null || z.string().url().safeParse(value).success, 'Ungültige URL.'),
  competitors: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        url: z
          .union([z.string().trim().max(500), z.null(), z.undefined()])
          .transform((value) => normalizeUrl(value) ?? '')
          .refine((value) => value === '' || z.string().url().safeParse(value).success, 'Ungültige URL.'),
      })
    )
    .max(3, 'Maximal 3 Wettbewerber.')
    .optional()
    .default([]),
  keywords: z
    .array(z.string().trim().min(1).max(300))
    .min(1, 'Mindestens 1 Keyword wird benötigt.')
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

  const projectIds = projects.map((p) => p.id)
  const summaries = await getProjectReportSummaryMap(tenantId, projectIds)

  const enriched = projects.map((p) => ({
    ...p,
    latest_analysis_status: summaries[p.id]?.latestAnalysisStatus ?? null,
    latest_analysis_at: summaries[p.id]?.latestAnalysisAt ?? null,
    latest_analytics_status: summaries[p.id]?.latestAnalyticsStatus ?? null,
    latest_share_of_model: summaries[p.id]?.latestShareOfModel ?? null,
    trend_delta: summaries[p.id]?.trendDelta ?? null,
    analysis_count: summaries[p.id]?.analysisCount ?? 0,
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
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = createProjectSchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json(
      { error: firstDetail ?? 'Validierungsfehler.', details },
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
      brand_name,
      website_url: website_url ?? null,
      competitors,
      keywords,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ project: data }, { status: 201 })
}
