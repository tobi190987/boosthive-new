import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { tenantGet, tenantPatch, tenantUrl } from './helpers/api-client'
import {
  cleanupTestSessions,
  setupTestSessions,
  type TestSessions,
} from './helpers/fixtures'

type SupabaseAdmin = SupabaseClient<any, 'public', any>

test.describe('ai visibility reporting api', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  let sessions: TestSessions
  let admin: SupabaseAdmin
  let seeded: Awaited<ReturnType<typeof seedVisibilityReportingData>>

  test.beforeAll(async ({ request }) => {
    test.setTimeout(120_000)
    sessions = await setupTestSessions(request)
    admin = createAdminClientForTests()
    seeded = await seedVisibilityReportingData(admin, sessions)
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestSessions(request, sessions)
  })

  test('GET /api/tenant/visibility/projects liefert Reporting-Summary-Felder', async ({ request }) => {
    const response = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/visibility/projects',
      sessions.tenantASeed.tenant.id,
      sessions.tenantAMemberCookies
    )

    expect(response.status()).toBe(200)
    const payload = await response.json()

    const project = payload.projects.find((item: { id: string }) => item.id === seeded.projectId)
    expect(project).toBeTruthy()
    expect(project.latest_analysis_status).toBe('done')
    expect(project.latest_analytics_status).toBe('done')
    expect(project.analysis_count).toBe(2)
    expect(project.latest_share_of_model).toBe(61)
    expect(project.trend_delta).toBe(11)
  })

  test('GET /api/tenant/visibility/projects/[id]/timeline liefert sortierte Verlaufspunkte mit Delta', async ({
    request,
  }) => {
    const response = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/visibility/projects/${seeded.projectId}/timeline`,
      sessions.tenantASeed.tenant.id,
      sessions.tenantAMemberCookies
    )

    expect(response.status()).toBe(200)
    const payload = await response.json()
    expect(Array.isArray(payload.timeline)).toBeTruthy()

    const brandPoints = payload.timeline.filter(
      (point: { subject_type: string; subject_name: string }) =>
        point.subject_type === 'brand' && point.subject_name === 'Acme AI'
    )

    expect(brandPoints).toHaveLength(2)
    expect(brandPoints[0].share_of_model).toBe(50)
    expect(brandPoints[0].delta_previous).toBeNull()
    expect(brandPoints[1].share_of_model).toBe(61)
    expect(brandPoints[1].delta_previous).toBe(11)
  })

  test('PATCH /api/tenant/visibility/recommendations/[id] speichert den Erledigt-Status', async ({
    request,
  }) => {
    const response = await tenantPatch(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/visibility/recommendations/${seeded.recommendationId}`,
      sessions.tenantASeed.tenant.id,
      { status: 'done' },
      sessions.tenantAMemberCookies
    )

    expect(response.status()).toBe(200)
    const payload = await response.json()
    expect(payload.recommendation.status).toBe('done')

    const { data } = await admin
      .from('visibility_recommendations')
      .select('status')
      .eq('id', seeded.recommendationId)
      .maybeSingle()

    expect(data?.status).toBe('done')
  })

  test('GET /api/tenant/visibility/analyses/[id]/report liefert eine PDF-Datei', async ({ request }) => {
    const response = await request.get(
      tenantUrl(
        sessions.tenantASeed.tenant.slug,
        `/api/tenant/visibility/analyses/${seeded.latestAnalysisId}/report`
      ),
      {
        headers: {
          'x-tenant-id': sessions.tenantASeed.tenant.id,
          cookie: `bh_preview_access=granted; ${sessions.tenantAMemberCookies}`,
        },
      }
    )

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/pdf')
    expect(response.headers()['content-disposition']).toContain('.pdf')

    const body = await response.body()
    expect(body.subarray(0, 8).toString()).toContain('%PDF-1.4')
  })
})

function createAdminClientForTests() {
  const env = loadEnvLocalFallback()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase Test-Umgebungsvariablen fehlen.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function loadEnvLocalFallback() {
  try {
    const content = readFileSync('.env.local', 'utf8')
    const values: Record<string, string> = {}

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue

      const separatorIndex = line.indexOf('=')
      if (separatorIndex === -1) continue

      const key = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
      values[key] = value
    }

    return values
  } catch {
    return {}
  }
}

async function seedVisibilityReportingData(admin: SupabaseAdmin, sessions: TestSessions) {
  const tenantId = sessions.tenantASeed.tenant.id

  const { data: module } = await admin
    .from('modules')
    .select('id')
    .eq('code', 'ai_visibility')
    .maybeSingle()

  if (!module) throw new Error('Modul ai_visibility nicht gefunden.')

  await admin.from('tenant_modules').upsert({
    tenant_id: tenantId,
    module_id: module.id,
    status: 'active',
    cancel_at_period_end: false,
  })

  const { data: project, error: projectError } = await admin
    .from('visibility_projects')
    .insert({
      tenant_id: tenantId,
      brand_name: 'Acme AI',
      website_url: 'https://acme-ai.example',
      competitors: [{ name: 'Beta Search', url: 'https://beta-search.example' }],
      keywords: ['ai sichtbarkeit', 'geo optimierung'],
    })
    .select('id')
    .single()

  if (projectError || !project) throw new Error(projectError?.message ?? 'Projekt konnte nicht erstellt werden.')

  const firstCompletedAt = '2026-03-10T10:00:00.000Z'
  const secondCompletedAt = '2026-03-20T10:00:00.000Z'

  const { data: analyses, error: analysesError } = await admin
    .from('visibility_analyses')
    .insert([
      {
        tenant_id: tenantId,
        project_id: project.id,
        models: ['openai/gpt-4o'],
        iterations: 5,
        status: 'done',
        analytics_status: 'done',
        progress_done: 20,
        progress_total: 20,
        completed_at: firstCompletedAt,
        analytics_completed_at: firstCompletedAt,
      },
      {
        tenant_id: tenantId,
        project_id: project.id,
        models: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
        iterations: 5,
        status: 'done',
        analytics_status: 'done',
        progress_done: 40,
        progress_total: 40,
        completed_at: secondCompletedAt,
        analytics_completed_at: secondCompletedAt,
      },
    ])
    .select('id, completed_at')

  if (analysesError || !analyses || analyses.length !== 2) {
    throw new Error(analysesError?.message ?? 'Analysen konnten nicht erstellt werden.')
  }

  const [firstAnalysis, secondAnalysis] = analyses.sort(
    (a, b) => new Date(a.completed_at ?? 0).getTime() - new Date(b.completed_at ?? 0).getTime()
  )

  const rows = [
    createScoreRow(tenantId, firstAnalysis.id, project.id, 'ai sichtbarkeit', 'brand', 'Acme AI', 48, 62),
    createScoreRow(tenantId, firstAnalysis.id, project.id, 'ai sichtbarkeit', 'competitor', 'Beta Search', 55, null),
    createScoreRow(tenantId, firstAnalysis.id, project.id, 'geo optimierung', 'brand', 'Acme AI', 52, 58),
    createScoreRow(tenantId, firstAnalysis.id, project.id, 'geo optimierung', 'competitor', 'Beta Search', 57, null),
    createScoreRow(tenantId, secondAnalysis.id, project.id, 'ai sichtbarkeit', 'brand', 'Acme AI', 60, 70),
    createScoreRow(tenantId, secondAnalysis.id, project.id, 'ai sichtbarkeit', 'competitor', 'Beta Search', 66, null),
    createScoreRow(tenantId, secondAnalysis.id, project.id, 'geo optimierung', 'brand', 'Acme AI', 62, 72),
    createScoreRow(tenantId, secondAnalysis.id, project.id, 'geo optimierung', 'competitor', 'Beta Search', 58, null),
  ]

  const { error: scoresError } = await admin.from('visibility_scores').insert(rows)
  if (scoresError) throw new Error(scoresError.message)

  const { error: sourcesError } = await admin.from('visibility_sources').insert([
    {
      tenant_id: tenantId,
      analysis_id: secondAnalysis.id,
      project_id: project.id,
      keyword: 'ai sichtbarkeit',
      model_name: 'all',
      source_domain: 'example-source.test',
      source_url: 'https://example-source.test/article',
      mention_count: 3,
      is_source_gap: false,
      mentioned_subjects: [{ type: 'brand', name: 'Acme AI', mentioned: true }],
    },
    {
      tenant_id: tenantId,
      analysis_id: secondAnalysis.id,
      project_id: project.id,
      keyword: 'geo optimierung',
      model_name: 'all',
      source_domain: 'competitor-gap.test',
      source_url: 'https://competitor-gap.test/guide',
      mention_count: 2,
      is_source_gap: true,
      mentioned_subjects: [{ type: 'competitor', name: 'Beta Search', mentioned: true }],
    },
  ])

  if (sourcesError) throw new Error(sourcesError.message)

  const { data: recommendations, error: recommendationsError } = await admin
    .from('visibility_recommendations')
    .insert([
      {
        tenant_id: tenantId,
        analysis_id: secondAnalysis.id,
        project_id: project.id,
        priority: 'high',
        title: 'Ausbau der GEO-Landingpage',
        description: 'Erweitere die Seite um konkrete Use-Cases und FAQ-Strukturen.',
        rationale: 'Wettbewerber werden bei GEO-bezogenen Keywords häufiger genannt.',
        recommendation_type: 'content',
        related_keyword: 'geo optimierung',
        status: 'open',
        sort_order: 1,
      },
      {
        tenant_id: tenantId,
        analysis_id: secondAnalysis.id,
        project_id: project.id,
        priority: 'medium',
        title: 'Schema-Markup ergänzen',
        description: 'Ergänze strukturierte Daten für Organisation und Service.',
        rationale: 'Bessere strukturierte Signale erhöhen die Wiedererkennbarkeit der Brand.',
        recommendation_type: 'schema',
        related_keyword: 'ai sichtbarkeit',
        status: 'open',
        sort_order: 2,
      },
    ])
    .select('id')

  if (recommendationsError || !recommendations?.[0]) {
    throw new Error(recommendationsError?.message ?? 'Empfehlungen konnten nicht erstellt werden.')
  }

  return {
    projectId: project.id,
    latestAnalysisId: secondAnalysis.id,
    recommendationId: recommendations[0].id,
  }
}

function createScoreRow(
  tenantId: string,
  analysisId: string,
  projectId: string,
  keyword: string,
  subjectType: 'brand' | 'competitor',
  subjectName: string,
  shareOfModel: number,
  geoScore: number | null
) {
  return {
    tenant_id: tenantId,
    analysis_id: analysisId,
    project_id: projectId,
    keyword,
    model_name: 'all',
    subject_type: subjectType,
    subject_name: subjectName,
    mention_count: Math.round(shareOfModel / 10),
    response_count: 10,
    share_of_model: shareOfModel,
    sentiment_positive: 70,
    sentiment_neutral: 20,
    sentiment_negative: 10,
    sentiment_unknown: 0,
    geo_score: geoScore,
  }
}
