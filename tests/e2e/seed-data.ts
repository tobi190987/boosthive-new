import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

type SupabaseAdmin = SupabaseClient<any, 'public', any>

interface E2ESeedResultLike {
  tenant: {
    id: string
  }
  users: {
    admin: {
      email: string
    }
    member: {
      email: string
    }
  }
}

export function createAdminClientForTests() {
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

export async function activateTenantModule(
  admin: SupabaseAdmin,
  tenantId: string,
  moduleCode: 'seo_analyse' | 'ai_visibility'
) {
  const { data: module } = await admin.from('modules').select('id').eq('code', moduleCode).maybeSingle()

  if (!module) {
    throw new Error(`Modul ${moduleCode} nicht gefunden.`)
  }

  const { error } = await admin.from('tenant_modules').upsert({
    tenant_id: tenantId,
    module_id: module.id,
    status: 'active',
    cancel_at_period_end: false,
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function completeTenantOnboarding(
  admin: SupabaseAdmin,
  seed: E2ESeedResultLike
) {
  const now = new Date().toISOString()

  const { data: memberRows, error: membersError } = await admin
    .from('tenant_members')
    .select('user_id, role')
    .eq('tenant_id', seed.tenant.id)

  if (membersError || !memberRows) {
    throw new Error(membersError?.message ?? 'Tenant-Mitglieder konnten nicht geladen werden.')
  }

  const usersByEmail = new Map([
    [seed.users.admin.email, { firstName: 'Ada', lastName: 'Admin' }],
    [seed.users.member.email, { firstName: 'Mia', lastName: 'Member' }],
  ])

  const userIds = memberRows.map((row) => row.user_id)
  const { data: authUsers, error: authError } = await admin.auth.admin.listUsers()
  if (authError) {
    throw new Error(authError.message)
  }

  const profiles = authUsers.users
    .filter((user) => userIds.includes(user.id) && user.email && usersByEmail.has(user.email))
    .map((user) => {
      const names = usersByEmail.get(user.email!)!
      return {
        user_id: user.id,
        first_name: names.firstName,
        last_name: names.lastName,
      }
    })

  if (profiles.length > 0) {
    const { error: profileError } = await admin.from('user_profiles').upsert(profiles, {
      onConflict: 'user_id',
    })

    if (profileError) {
      throw new Error(profileError.message)
    }
  }

  const { error: tenantError } = await admin
    .from('tenants')
    .update({
      billing_company: 'BoostHive Test GmbH',
      billing_street: 'Teststrasse 1',
      billing_zip: '10115',
      billing_city: 'Berlin',
      billing_country: 'DE',
      billing_onboarding_completed_at: now,
    })
    .eq('id', seed.tenant.id)

  if (tenantError) {
    throw new Error(tenantError.message)
  }

  const { error: memberUpdateError } = await admin
    .from('tenant_members')
    .update({ onboarding_completed_at: now })
    .eq('tenant_id', seed.tenant.id)

  if (memberUpdateError) {
    throw new Error(memberUpdateError.message)
  }
}

export async function seedVisibilityReportingData(
  admin: SupabaseAdmin,
  tenantId: string
) {
  await activateTenantModule(admin, tenantId, 'ai_visibility')

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

  if (projectError || !project) {
    throw new Error(projectError?.message ?? 'Projekt konnte nicht erstellt werden.')
  }

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
    createScoreRow(tenantId, firstAnalysis.id, project.id, 'ai sichtbarkeit', 'brand', 'Acme AI', 47, 61, 'openai/gpt-4o'),
    createScoreRow(tenantId, firstAnalysis.id, project.id, 'ai sichtbarkeit', 'competitor', 'Beta Search', 56, null, 'openai/gpt-4o'),
    createScoreRow(tenantId, secondAnalysis.id, project.id, 'ai sichtbarkeit', 'brand', 'Acme AI', 60, 70),
    createScoreRow(tenantId, secondAnalysis.id, project.id, 'ai sichtbarkeit', 'competitor', 'Beta Search', 66, null),
    createScoreRow(tenantId, secondAnalysis.id, project.id, 'geo optimierung', 'brand', 'Acme AI', 62, 72),
    createScoreRow(tenantId, secondAnalysis.id, project.id, 'geo optimierung', 'competitor', 'Beta Search', 58, null),
    createScoreRow(tenantId, secondAnalysis.id, project.id, 'ai sichtbarkeit', 'brand', 'Acme AI', 58, 68, 'openai/gpt-4o'),
    createScoreRow(tenantId, secondAnalysis.id, project.id, 'ai sichtbarkeit', 'competitor', 'Beta Search', 65, null, 'openai/gpt-4o'),
  ]

  const { error: scoresError } = await admin.from('visibility_scores').insert(rows)
  if (scoresError) throw new Error(scoresError.message)

  const { error: sourcesError } = await admin.from('visibility_sources').insert([
    {
      tenant_id: tenantId,
      analysis_id: firstAnalysis.id,
      project_id: project.id,
      keyword: 'geo optimierung',
      model_name: 'all',
      source_domain: 'competitor-gap.test',
      source_url: 'https://competitor-gap.test/guide',
      mention_count: 2,
      is_source_gap: true,
      mentioned_subjects: [{ type: 'competitor', name: 'Beta Search', mentioned: true }],
    },
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
        analysis_id: firstAnalysis.id,
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
        priority: 'high',
        title: 'Ausbau der GEO-Landingpage',
        description: 'Erweitere die Seite um konkrete Use-Cases und FAQ-Strukturen.',
        rationale: 'Wettbewerber werden bei GEO-bezogenen Keywords häufiger genannt.',
        recommendation_type: 'content',
        related_keyword: 'geo optimierung',
        status: 'open',
        sort_order: 2,
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
        sort_order: 3,
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
  geoScore: number | null,
  modelName = 'all'
) {
  return {
    tenant_id: tenantId,
    analysis_id: analysisId,
    project_id: projectId,
    keyword,
    model_name: modelName,
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
