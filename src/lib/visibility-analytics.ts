import { createAdminClient } from '@/lib/supabase-admin'

export type AnalyticsStatus = 'pending' | 'running' | 'done' | 'failed' | 'partial'
type RecommendationPriority = 'high' | 'medium' | 'low'
type RecommendationStatus = 'open' | 'done'
type SubjectType = 'brand' | 'competitor'
type SentimentLabel = 'positive' | 'neutral' | 'negative' | 'unknown'

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

interface Competitor {
  name: string
  url?: string
}

interface RawResultRow {
  id: string
  keyword: string
  model_name: string
  response: string
  error_flag: boolean
}

interface ProjectRow {
  id: string
  brand_name: string
  website_url: string | null
  competitors: Competitor[] | null
  keywords: string[] | null
}

interface AnalysisRow {
  id: string
  tenant_id: string
  project_id: string
  status: string
  analytics_status: AnalyticsStatus
}

interface SubjectMention {
  type: SubjectType
  name: string
  mentioned: boolean
  confidence: number
  sentiment: Record<SentimentLabel, number>
}

interface SourceExtraction {
  domain: string
  url: string | null
}

interface NormalizedResult {
  keyword: string
  modelName: string
  subjectMentions: SubjectMention[]
  sources: SourceExtraction[]
}

interface ScoreRow {
  tenant_id: string
  analysis_id: string
  project_id: string
  keyword: string
  model_name: string
  subject_type: SubjectType
  subject_name: string
  mention_count: number
  response_count: number
  share_of_model: number
  sentiment_positive: number
  sentiment_neutral: number
  sentiment_negative: number
  sentiment_unknown: number
  geo_score: number | null
}

interface RecommendationRow {
  tenant_id: string
  analysis_id: string
  project_id: string
  priority: RecommendationPriority
  title: string
  description: string
  rationale: string
  recommendation_type: string
  related_keyword: string | null
  status: RecommendationStatus
  sort_order: number
}

interface SourceRow {
  tenant_id: string
  analysis_id: string
  project_id: string
  keyword: string
  model_name: string
  source_domain: string
  source_url: string | null
  mentioned_subjects: Json[]
  mention_count: number
  is_source_gap: boolean
}

interface RecommendationCandidate {
  priority: RecommendationPriority
  title: string
  description: string
  rationale: string
  recommendation_type: string
  related_keyword?: string | null
}

const MAX_RETRIES = 2
const BASE_BACKOFF_MS = 1500

export function getVisibilityBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export async function dispatchAnalyticsWorker(
  analysisId: string,
  options?: { force?: boolean }
): Promise<void> {
  const admin = createAdminClient()
  const workerSecret = process.env.VISIBILITY_WORKER_SECRET

  if (!workerSecret) {
    await markAnalyticsFailed(admin, analysisId, 'VISIBILITY_WORKER_SECRET ist nicht konfiguriert.')
    return
  }

  const body = { analysis_id: analysisId, force: options?.force ?? false }

  fetch(`${getVisibilityBaseUrl()}/api/tenant/visibility/analytics/worker`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-secret': workerSecret,
    },
    body: JSON.stringify(body),
  })
    .then(async (response) => {
      if (response.ok) return

      const payload = await response.json().catch(() => ({}))
      const message =
        typeof payload.error === 'string'
          ? payload.error
          : `Analytics-Worker fehlgeschlagen (${response.status}).`
      await markAnalyticsFailed(admin, analysisId, message)
    })
    .catch(async (error) => {
      const message =
        error instanceof Error ? error.message : 'Analytics-Worker konnte nicht gestartet werden.'
      await markAnalyticsFailed(admin, analysisId, message)
    })
}

export async function runAnalyticsProcessing(
  analysisId: string,
  options?: { force?: boolean }
): Promise<{ status: AnalyticsStatus; recommendationsCount: number }> {
  const admin = createAdminClient()
  const analysis = await loadAnalysis(admin, analysisId)

  if (!analysis) {
    throw new Error('Analyse nicht gefunden.')
  }

  if (analysis.status !== 'done' && !options?.force) {
    throw new Error('Analytics können erst nach abgeschlossener Analyse berechnet werden.')
  }

  if (analysis.analytics_status === 'running' && !options?.force) {
    return { status: 'running', recommendationsCount: 0 }
  }

  const project = await loadProject(admin, analysis.project_id)
  if (!project) {
    throw new Error('Projekt nicht gefunden.')
  }

  const rawResults = await loadRawResults(admin, analysisId)

  await admin
    .from('visibility_analyses')
    .update({
      analytics_status: 'running',
      analytics_error_message: null,
      analytics_started_at: new Date().toISOString(),
      analytics_completed_at: null,
    })
    .eq('id', analysisId)

  await clearExistingAnalytics(admin, analysisId)

  try {
    const normalized = await normalizeResults(project, rawResults)
    const scoreRows = buildScoreRows(analysis, project, normalized)
    const sourceRows = buildSourceRows(analysis, project, normalized)
    const recommendationRows = await buildRecommendationRows(analysis, project, scoreRows, sourceRows)

    if (scoreRows.length > 0) {
      const { error } = await admin.from('visibility_scores').insert(scoreRows)
      if (error) throw new Error(error.message)
    }

    if (sourceRows.length > 0) {
      const { error } = await admin.from('visibility_sources').insert(sourceRows)
      if (error) throw new Error(error.message)
    }

    if (recommendationRows.length > 0) {
      const { error } = await admin.from('visibility_recommendations').insert(recommendationRows)
      if (error) throw new Error(error.message)
    }

    const analyticsStatus: AnalyticsStatus = recommendationRows.length >= 5 ? 'done' : 'partial'

    await admin
      .from('visibility_analyses')
      .update({
        analytics_status: analyticsStatus,
        analytics_completed_at: new Date().toISOString(),
      })
      .eq('id', analysisId)

    return { status: analyticsStatus, recommendationsCount: recommendationRows.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analytics-Verarbeitung fehlgeschlagen.'
    await markAnalyticsFailed(admin, analysisId, message)
    throw error
  }
}

async function loadAnalysis(
  admin: ReturnType<typeof createAdminClient>,
  analysisId: string
): Promise<AnalysisRow | null> {
  const { data } = await admin
    .from('visibility_analyses')
    .select('id, tenant_id, project_id, status, analytics_status')
    .eq('id', analysisId)
    .maybeSingle()

  return (data as AnalysisRow | null) ?? null
}

async function loadProject(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string
): Promise<ProjectRow | null> {
  const { data } = await admin
    .from('visibility_projects')
    .select('id, brand_name, website_url, competitors, keywords')
    .eq('id', projectId)
    .maybeSingle()

  return (data as ProjectRow | null) ?? null
}

async function loadRawResults(
  admin: ReturnType<typeof createAdminClient>,
  analysisId: string
): Promise<RawResultRow[]> {
  const { data, error } = await admin
    .from('visibility_raw_results')
    .select('id, keyword, model_name, response, error_flag')
    .eq('analysis_id', analysisId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data as RawResultRow[] | null) ?? []
}

async function clearExistingAnalytics(
  admin: ReturnType<typeof createAdminClient>,
  analysisId: string
): Promise<void> {
  await admin.from('visibility_scores').delete().eq('analysis_id', analysisId)
  await admin.from('visibility_sources').delete().eq('analysis_id', analysisId)
  await admin.from('visibility_recommendations').delete().eq('analysis_id', analysisId)
}

async function normalizeResults(
  project: ProjectRow,
  rawResults: RawResultRow[]
): Promise<NormalizedResult[]> {
  const competitors = project.competitors ?? []
  const normalized: NormalizedResult[] = []

  for (const row of rawResults) {
    if (row.error_flag || !row.response.trim()) continue

    const subjectMentions = [
      createSubjectMention('brand', project.brand_name, row.response),
      ...competitors.map((competitor) =>
        createSubjectMention('competitor', competitor.name, row.response)
      ),
    ]

    const subjectMentionsWithSentiment = await Promise.all(
      subjectMentions.map(async (subject) => ({
        ...subject,
        sentiment: subject.mentioned
          ? await classifySentimentForSubject(row.response, subject.name)
          : labelToDistribution('unknown'),
      }))
    )

    normalized.push({
      keyword: row.keyword,
      modelName: row.model_name,
      subjectMentions: subjectMentionsWithSentiment,
      sources: await extractSources(row.response),
    })
  }

  return normalized
}

function createSubjectMention(
  type: SubjectType,
  subjectName: string,
  response: string
): SubjectMention {
  const confidence = computeMentionConfidence(response, subjectName)
  return {
    type,
    name: subjectName,
    confidence,
    mentioned: confidence >= 0.82,
    sentiment: labelToDistribution('unknown'),
  }
}

function computeMentionConfidence(response: string, subjectName: string): number {
  const trimmedSubject = subjectName.trim()
  if (!trimmedSubject) return 0

  const escaped = escapeRegExp(trimmedSubject)
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i')
  if (pattern.test(response)) return 1

  const normalizedResponse = normalizeText(response)
  const normalizedSubject = normalizeText(trimmedSubject)
  if (!normalizedResponse || !normalizedSubject) return 0

  if (normalizedResponse.includes(normalizedSubject)) return 0.9

  const subjectTokens = normalizedSubject.split(' ').filter(Boolean)
  const responseTokens = new Set(normalizedResponse.split(' ').filter(Boolean))
  const matchedTokens = subjectTokens.filter((token) => responseTokens.has(token))
  const coverage = matchedTokens.length / Math.max(subjectTokens.length, 1)

  if (subjectTokens.length > 1 && coverage === 1) return 0.84
  if (subjectTokens.length === 1 && subjectTokens[0].length >= 5 && responseTokens.has(subjectTokens[0])) {
    return 0.88
  }

  return 0
}

async function classifySentimentForSubject(
  response: string,
  subjectName: string
): Promise<Record<SentimentLabel, number>> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return labelToDistribution('unknown')
  }

  const prompt = [
    `Bewerte das Sentiment ausschließlich für die Erwähnung von "${subjectName}" in der folgenden KI-Antwort.`,
    'Ignoriere die Bewertung anderer Marken oder Wettbewerber in derselben Antwort.',
    'Gib nur JSON im Format {"label":"positive|neutral|negative|unknown"} zurück.',
    'Antwort:',
    response.slice(0, 4000),
  ].join('\n')

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(BASE_BACKOFF_MS * attempt)

    try {
      const payload = await callOpenRouter(apiKey, 'openai/gpt-4o-mini', prompt, 150)
      const parsed = safeJsonParse(payload.text)
      const label = normalizeSentimentLabel(parsed?.label)
      return labelToDistribution(label)
    } catch {
      continue
    }
  }

  return labelToDistribution('unknown')
}

function labelToDistribution(label: SentimentLabel): Record<SentimentLabel, number> {
  return {
    positive: label === 'positive' ? 100 : 0,
    neutral: label === 'neutral' ? 100 : 0,
    negative: label === 'negative' ? 100 : 0,
    unknown: label === 'unknown' ? 100 : 0,
  }
}

function normalizeSentimentLabel(value: unknown): SentimentLabel {
  if (value === 'positive' || value === 'neutral' || value === 'negative' || value === 'unknown') {
    return value
  }
  return 'unknown'
}

async function extractSources(response: string): Promise<SourceExtraction[]> {
  const unique = new Map<string, SourceExtraction>()

  const urlMatches = response.match(/https?:\/\/[^\s)>\]]+/gi) ?? []
  for (const match of urlMatches) {
    addSourceCandidate(unique, match)
  }

  const bareDomainMatches =
    response.match(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s)>]*)?/gi) ?? []
  for (const match of bareDomainMatches) {
    if (match.startsWith('http://') || match.startsWith('https://')) continue
    addSourceCandidate(unique, `https://${match}`)
  }

  if (unique.size > 0) return Array.from(unique.values())

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return []

  const llmSources = await extractSourcesWithLlm(apiKey, response)
  for (const source of llmSources) {
    unique.set(`${source.domain}:${source.url ?? ''}`, source)
  }

  return Array.from(unique.values())
}

function addSourceCandidate(unique: Map<string, SourceExtraction>, candidate: string): void {
  try {
    const parsed = new URL(candidate.replace(/[.,;]+$/, ''))
    const domain = parsed.hostname.replace(/^www\./, '')
    if (!domain) return
    unique.set(`${domain}:${parsed.href}`, { domain, url: parsed.href })
  } catch {
    return
  }
}

function buildScoreRows(
  analysis: AnalysisRow,
  project: ProjectRow,
  normalized: NormalizedResult[]
): ScoreRow[] {
  const groups = new Map<string, {
    keyword: string
    modelName: string
    subjectType: SubjectType
    subjectName: string
    mentionCount: number
    responseCount: number
    positive: number
    neutral: number
    negative: number
    unknown: number
  }>()

  for (const row of normalized) {
    for (const subject of row.subjectMentions) {
      const key = [row.keyword, row.modelName, subject.type, subject.name].join('::')
      const current = groups.get(key) ?? {
        keyword: row.keyword,
        modelName: row.modelName,
        subjectType: subject.type,
        subjectName: subject.name,
        mentionCount: 0,
        responseCount: 0,
        positive: 0,
        neutral: 0,
        negative: 0,
        unknown: 0,
      }

      current.responseCount += 1
      if (subject.mentioned) current.mentionCount += 1
      if (subject.mentioned) {
        current.positive += subject.sentiment.positive
        current.neutral += subject.sentiment.neutral
        current.negative += subject.sentiment.negative
        current.unknown += subject.sentiment.unknown
      }
      groups.set(key, current)
    }
  }

  const rows = Array.from(groups.values()).map((group) =>
    toScoreRow(analysis, project, {
      keyword: group.keyword,
      modelName: group.modelName,
      subjectType: group.subjectType,
      subjectName: group.subjectName,
      mentionCount: group.mentionCount,
      responseCount: group.responseCount,
      positive: group.positive,
      neutral: group.neutral,
      negative: group.negative,
      unknown: group.unknown,
    })
  )

  const aggregateGroups = new Map<string, ReturnType<typeof toAggregateSeed>>()
  for (const row of rows) {
    const key = [row.keyword, row.subject_type, row.subject_name].join('::')
    const current = aggregateGroups.get(key) ?? toAggregateSeed(row.keyword, row.subject_type, row.subject_name)
    current.mentionCount += row.mention_count
    current.responseCount += row.response_count
    current.positive += row.sentiment_positive * row.mention_count
    current.neutral += row.sentiment_neutral * row.mention_count
    current.negative += row.sentiment_negative * row.mention_count
    current.unknown += row.sentiment_unknown * row.mention_count
    aggregateGroups.set(key, current)
  }

  for (const aggregate of aggregateGroups.values()) {
    const mentionBase = Math.max(aggregate.mentionCount, 1)
    rows.push(
      toScoreRow(analysis, project, {
        keyword: aggregate.keyword,
        modelName: 'all',
        subjectType: aggregate.subjectType,
        subjectName: aggregate.subjectName,
        mentionCount: aggregate.mentionCount,
        responseCount: aggregate.responseCount,
        positive: aggregate.positive / mentionBase,
        neutral: aggregate.neutral / mentionBase,
        negative: aggregate.negative / mentionBase,
        unknown: aggregate.unknown / mentionBase,
      })
    )
  }

  applyGeoScores(rows)
  return rows
}

function toAggregateSeed(keyword: string, subjectType: SubjectType, subjectName: string) {
  return {
    keyword,
    subjectType,
    subjectName,
    mentionCount: 0,
    responseCount: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    unknown: 0,
  }
}

function toScoreRow(
  analysis: AnalysisRow,
  project: ProjectRow,
  input: {
    keyword: string
    modelName: string
    subjectType: SubjectType
    subjectName: string
    mentionCount: number
    responseCount: number
    positive: number
    neutral: number
    negative: number
    unknown: number
  }
): ScoreRow {
  const responseCount = Math.max(input.responseCount, 1)
  const mentionCount = Math.max(input.mentionCount, 0)
  return {
    tenant_id: analysis.tenant_id,
    analysis_id: analysis.id,
    project_id: project.id,
    keyword: input.keyword,
    model_name: input.modelName,
    subject_type: input.subjectType,
    subject_name: input.subjectName,
    mention_count: input.mentionCount,
    response_count: input.responseCount,
    share_of_model: round2((input.mentionCount / responseCount) * 100),
    sentiment_positive: mentionCount > 0 ? round2(input.positive / mentionCount) : 0,
    sentiment_neutral: mentionCount > 0 ? round2(input.neutral / mentionCount) : 0,
    sentiment_negative: mentionCount > 0 ? round2(input.negative / mentionCount) : 0,
    sentiment_unknown: mentionCount > 0 ? round2(input.unknown / mentionCount) : 0,
    geo_score: null,
  }
}

function applyGeoScores(rows: ScoreRow[]): void {
  const allRows = rows.filter((row) => row.model_name === 'all')
  const byKeyword = new Map<string, ScoreRow[]>()

  for (const row of allRows) {
    const group = byKeyword.get(row.keyword) ?? []
    group.push(row)
    byKeyword.set(row.keyword, group)
  }

  for (const group of byKeyword.values()) {
    const brand = group.find((row) => row.subject_type === 'brand')
    if (!brand) continue

    const competitorBest = Math.max(
      ...group.filter((row) => row.subject_type === 'competitor').map((row) => row.share_of_model),
      0
    )
    const visibilityScore = brand.share_of_model
    const sentimentScore = Math.max(0, 100 - brand.sentiment_negative + brand.sentiment_positive * 0.3)
    const gapPenalty = Math.max(0, competitorBest - brand.share_of_model)
    const geoScore = round2(
      Math.max(0, Math.min(100, visibilityScore * 0.55 + sentimentScore * 0.25 + (100 - gapPenalty) * 0.2))
    )

    for (const row of rows) {
      if (row.keyword === brand.keyword && row.subject_type === 'brand') {
        row.geo_score = geoScore
      }
    }
  }
}

function buildSourceRows(
  analysis: AnalysisRow,
  project: ProjectRow,
  normalized: NormalizedResult[]
): SourceRow[] {
  const rows = new Map<string, SourceRow>()

  for (const row of normalized) {
    const mentionedSubjects = row.subjectMentions.filter((subject) => subject.mentioned)
    for (const source of row.sources) {
      const key = [row.keyword, row.modelName, source.domain, source.url ?? ''].join('::')
      const current = rows.get(key) ?? {
        tenant_id: analysis.tenant_id,
        analysis_id: analysis.id,
        project_id: project.id,
        keyword: row.keyword,
        model_name: row.modelName,
        source_domain: source.domain,
        source_url: source.url,
        mentioned_subjects: [],
        mention_count: 0,
        is_source_gap: false,
      }

      current.mention_count += 1
      const existing = new Set(current.mentioned_subjects.map((item) => JSON.stringify(item)))
      for (const subject of mentionedSubjects) {
        const payload = { type: subject.type, name: subject.name } satisfies Json
        const encoded = JSON.stringify(payload)
        if (!existing.has(encoded)) {
          current.mentioned_subjects.push(payload)
          existing.add(encoded)
        }
      }

      rows.set(key, current)
    }
  }

  for (const row of rows.values()) {
    const mentionsBrand = row.mentioned_subjects.some(
      (item) => readSubjectType(item) === 'brand'
    )
    const mentionsCompetitor = row.mentioned_subjects.some(
      (item) => readSubjectType(item) === 'competitor'
    )
    row.is_source_gap = mentionsCompetitor && !mentionsBrand
  }

  return Array.from(rows.values())
}

async function buildRecommendationRows(
  analysis: AnalysisRow,
  project: ProjectRow,
  scoreRows: ScoreRow[],
  sourceRows: SourceRow[]
): Promise<RecommendationRow[]> {
  const generated = await generateRecommendations(project, scoreRows, sourceRows)
  return generated.slice(0, 8).map((item, index) => ({
    tenant_id: analysis.tenant_id,
    analysis_id: analysis.id,
    project_id: project.id,
    priority: item.priority,
    title: item.title,
    description: item.description,
    rationale: item.rationale,
    recommendation_type: item.recommendation_type,
    related_keyword: item.related_keyword ?? null,
    status: 'open',
    sort_order: index,
  }))
}

async function generateRecommendations(
  project: ProjectRow,
  scoreRows: ScoreRow[],
  sourceRows: SourceRow[]
): Promise<RecommendationCandidate[]> {
  const heuristic = buildHeuristicRecommendations(project, scoreRows, sourceRows)
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return heuristic

  const promptPayload = {
    brand: project.brand_name,
    website_url: project.website_url,
    score_summary: scoreRows
      .filter((row) => row.model_name === 'all')
      .map((row) => ({
        keyword: row.keyword,
        subject_type: row.subject_type,
        subject_name: row.subject_name,
        som: row.share_of_model,
        negative: row.sentiment_negative,
        geo_score: row.geo_score,
      })),
    source_gaps: sourceRows
      .filter((row) => row.is_source_gap)
      .slice(0, 10)
      .map((row) => ({ keyword: row.keyword, domain: row.source_domain })),
  }

  const prompt = [
    'Erzeuge mindestens 5 konkrete GEO-Empfehlungen für eine SEO-/AI-Visibility-Analyse.',
    'Gib nur JSON im Format {"recommendations":[{"priority":"high|medium|low","title":"...","description":"...","rationale":"...","recommendation_type":"content|schema|authority|source_gap|keyword_gap","related_keyword":"optional"}]}.',
    'Die Empfehlungen müssen handlungsorientiert und spezifisch sein.',
    JSON.stringify(promptPayload),
  ].join('\n')

  try {
    const response = await callOpenRouter(apiKey, 'openai/gpt-4o-mini', prompt, 900)
    const parsed = safeJsonParse(response.text)
    const recommendations = Array.isArray(parsed?.recommendations) ? parsed.recommendations : []
    const normalized = recommendations
      .map((item) => normalizeRecommendation(item))
      .filter((item): item is RecommendationCandidate => item !== null)

    if (normalized.length >= 5) {
      return normalized
    }
  } catch {
    // Fall back to deterministic recommendations below.
  }

  return heuristic
}

function normalizeRecommendation(value: unknown): RecommendationCandidate | null {
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const priority = normalizePriority(record.priority)
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  const description = typeof record.description === 'string' ? record.description.trim() : ''
  const rationale = typeof record.rationale === 'string' ? record.rationale.trim() : ''
  const recommendationType =
    typeof record.recommendation_type === 'string' && record.recommendation_type.trim()
      ? record.recommendation_type.trim()
      : 'content'
  const relatedKeyword =
    typeof record.related_keyword === 'string' && record.related_keyword.trim()
      ? record.related_keyword.trim()
      : null

  if (!priority || !title || !description || !rationale) return null

  return {
    priority,
    title,
    description,
    rationale,
    recommendation_type: recommendationType,
    related_keyword: relatedKeyword,
  }
}

function normalizePriority(value: unknown): RecommendationPriority | null {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return null
}

function buildHeuristicRecommendations(
  project: ProjectRow,
  scoreRows: ScoreRow[],
  sourceRows: SourceRow[]
): RecommendationCandidate[] {
  const allRows = scoreRows.filter((row) => row.model_name === 'all')
  const brandRows = allRows.filter((row) => row.subject_type === 'brand')
  const competitorRows = allRows.filter((row) => row.subject_type === 'competitor')
  const recommendations: RecommendationCandidate[] = []

  const keywordGaps = brandRows
    .map((brandRow) => {
      const competitorBest = competitorRows
        .filter((row) => row.keyword === brandRow.keyword)
        .sort((a, b) => b.share_of_model - a.share_of_model)[0]
      if (!competitorBest) return null
      return {
        keyword: brandRow.keyword,
        gap: competitorBest.share_of_model - brandRow.share_of_model,
        competitorName: competitorBest.subject_name,
        competitorSom: competitorBest.share_of_model,
        brandSom: brandRow.share_of_model,
        responseCount: brandRow.response_count,
      }
    })
    .filter((item): item is {
      keyword: string
      gap: number
      competitorName: string
      competitorSom: number
      brandSom: number
      responseCount: number
    } => !!item)
    .sort((a, b) => b.gap - a.gap)

  const topGap = keywordGaps.find(
    (item) => item.responseCount >= 5 && item.competitorSom >= Math.max(item.brandSom * 2, 1)
  )
  if (topGap) {
    recommendations.push({
      priority: 'high',
      title: `Content-Lücke bei "${topGap.keyword}" schließen`,
      description: `Erstelle oder überarbeite eine Landingpage rund um "${topGap.keyword}" mit klarer Positionierung für ${project.brand_name}.`,
      rationale: `${topGap.competitorName} wird für dieses Keyword deutlich häufiger genannt als die Brand.`,
      recommendation_type: 'keyword_gap',
      related_keyword: topGap.keyword,
    })
  }

  const negativeBrandRow = brandRows.sort((a, b) => b.sentiment_negative - a.sentiment_negative)[0]
  if (negativeBrandRow && negativeBrandRow.sentiment_negative >= 25) {
    recommendations.push({
      priority: 'high',
      title: 'Vertrauenssignale und Proof Points ausbauen',
      description: 'Ergaenze Kundenbelege, Fallstudien, Preise und klare Nutzenargumente auf stark betroffenen Seiten.',
      rationale: `Das negative Sentiment ist für "${negativeBrandRow.keyword}" überdurchschnittlich hoch.`,
      recommendation_type: 'authority',
      related_keyword: negativeBrandRow.keyword,
    })
  }

  const sourceGap = sourceRows
    .filter((row) => row.is_source_gap)
    .sort((a, b) => b.mention_count - a.mention_count)[0]
  if (sourceGap) {
    recommendations.push({
      priority: 'high',
      title: `Praesenz auf ${sourceGap.source_domain} aufbauen`,
      description: `Pruefe Partnerschaften, Gastbeitraege oder Listungen, damit ${project.brand_name} auf dieser Quelle vorkommt.`,
      rationale: `Die Domain wird aktuell im Wettbewerbsumfeld genannt, aber nicht in Verbindung mit der Brand.`,
      recommendation_type: 'source_gap',
      related_keyword: sourceGap.keyword,
    })
  }

  recommendations.push({
    priority: 'medium',
    title: 'Schema.org-Markup für Kernseiten erweitern',
    description: 'Nutze strukturierte Daten für Organization, Product oder LocalBusiness, damit Modelle die Brand leichter zuordnen können.',
    rationale: 'Sauber ausgezeichnete Entitaeten verbessern die Wiedererkennbarkeit in generativen Antworten.',
    recommendation_type: 'schema',
    related_keyword: null,
  })

  recommendations.push({
    priority: 'medium',
    title: 'FAQ-Content für häufige Nutzerfragen anlegen',
    description: 'Baue kurze, direkte Antwortformate für die stärksten Keywords, damit KIs klare Textbausteine finden.',
    rationale: 'Generative Systeme bevorzugen gut strukturierte, zitierbare Antworten.',
    recommendation_type: 'content',
    related_keyword: project.keywords?.[0] ?? null,
  })

  recommendations.push({
    priority: 'low',
    title: 'Vergleichsseiten gegen Hauptwettbewerber erstellen',
    description: 'Erstelle objektive Vergleichsseiten, die Unterschiede, Einsatzfaelle und USPs gegen Wettbewerber erklaeren.',
    rationale: 'Das hilft bei Keywords, in denen die Brand aktuell hinter Wettbewerbern liegt.',
    recommendation_type: 'content',
    related_keyword: topGap?.keyword ?? null,
  })

  return dedupeRecommendations(recommendations)
}

function dedupeRecommendations(items: RecommendationCandidate[]): RecommendationCandidate[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.priority}:${item.title}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function markAnalyticsFailed(
  admin: ReturnType<typeof createAdminClient>,
  analysisId: string,
  errorMessage: string
): Promise<void> {
  await admin
    .from('visibility_analyses')
    .update({
      analytics_status: 'failed',
      analytics_error_message: errorMessage,
      analytics_completed_at: new Date().toISOString(),
    })
    .eq('id', analysisId)
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens: number
): Promise<{ text: string }> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://boost-hive.de',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`OpenRouter API Fehler ${response.status}: ${errorBody.slice(0, 200)}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = data.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('Leere Antwort vom Analytics-Modell.')
  return { text }
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function extractSourcesWithLlm(
  apiKey: string,
  response: string
): Promise<SourceExtraction[]> {
  const prompt = [
    'Extrahiere genannte oder zitierte Quellen aus der folgenden KI-Antwort.',
    'Gib nur JSON im Format {"sources":[{"domain":"example.com","url":"https://example.com/optional"}]}.',
    'Wenn keine Quellen genannt werden, gib {"sources":[]} zurück.',
    response.slice(0, 4000),
  ].join('\n')

  try {
    const payload = await callOpenRouter(apiKey, 'openai/gpt-4o-mini', prompt, 250)
    const parsed = safeJsonParse(payload.text)
    const sources = Array.isArray(parsed?.sources) ? parsed.sources : []
    return sources
      .map((item) => normalizeSourceExtraction(item))
      .filter((item): item is SourceExtraction => item !== null)
  } catch {
    return []
  }
}

function normalizeSourceExtraction(value: unknown): SourceExtraction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const rawDomain = typeof record.domain === 'string' ? record.domain.trim().toLowerCase() : ''
  const rawUrl = typeof record.url === 'string' ? record.url.trim() : ''
  const domain = rawDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')

  if (!domain) return null

  let url: string | null = null
  if (rawUrl) {
    try {
      url = new URL(rawUrl).href
    } catch {
      url = `https://${domain}`
    }
  }

  return { domain, url }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function readSubjectType(value: Json): SubjectType | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = (value as Record<string, Json>).type
  return candidate === 'brand' || candidate === 'competitor' ? candidate : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
