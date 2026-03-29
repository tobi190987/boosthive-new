import { createAdminClient } from '@/lib/supabase-admin'

type AnalyticsStatus = 'pending' | 'running' | 'done' | 'failed' | 'partial'
type SubjectType = 'brand' | 'competitor'

interface AnalysisSummaryRow {
  id: string
  tenant_id: string
  project_id: string
  status: string
  analytics_status: AnalyticsStatus
  analytics_error_message: string | null
  created_at: string
  completed_at: string | null
  analytics_completed_at: string | null
}

interface ProjectRow {
  id: string
  brand_name: string
  website_url: string | null
  competitors: Array<{ name: string; url?: string | null }> | null
  keywords: string[] | null
}

interface TenantBrandingRow {
  id: string
  name: string
  logo_url: string | null
}

interface ScoreRow {
  analysis_id: string
  keyword: string
  model_name: string
  subject_type: SubjectType
  subject_name: string
  share_of_model: number
  geo_score: number | null
}

interface SourceMention {
  type?: string
  name?: string
  mentioned?: boolean
}

interface SourceRow {
  source_domain: string
  mention_count: number
  is_source_gap: boolean
  mentioned_subjects: SourceMention[] | null
}

interface RecommendationRow {
  id: string
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  rationale: string
  related_keyword: string | null
  status: 'open' | 'done'
  sort_order: number
}

export interface ProjectReportSummary {
  latestAnalysisStatus: string | null
  latestAnalysisAt: string | null
  latestAnalyticsStatus: AnalyticsStatus | null
  latestShareOfModel: number | null
  trendDelta: number | null
  analysisCount: number
}

export interface TimelinePoint {
  analysis_id: string
  completed_at: string
  subject_name: string
  subject_type: SubjectType
  share_of_model: number
  delta_previous: number | null
}

export interface ReportPayload {
  tenant: TenantBrandingRow
  project: ProjectRow
  analysis: AnalysisSummaryRow
  scores: ScoreRow[]
  sources: SourceRow[]
  recommendations: RecommendationRow[]
  timeline: TimelinePoint[]
}

export async function getProjectReportSummaryMap(
  tenantId: string,
  projectIds: string[]
): Promise<Record<string, ProjectReportSummary>> {
  if (projectIds.length === 0) return {}

  const admin = createAdminClient()
  const { data: analyses, error: analysesError } = await admin
    .from('visibility_analyses')
    .select(
      'id, tenant_id, project_id, status, analytics_status, analytics_error_message, created_at, completed_at, analytics_completed_at'
    )
    .eq('tenant_id', tenantId)
    .in('project_id', projectIds)
    .order('created_at', { ascending: false })

  if (analysesError) throw new Error(analysesError.message)

  const analysisRows = (analyses as AnalysisSummaryRow[] | null) ?? []
  const latestByProject: Record<string, AnalysisSummaryRow> = {}
  const reportableByProject = new Map<string, AnalysisSummaryRow[]>()
  const analysisCountByProject: Record<string, number> = {}

  for (const analysis of analysisRows) {
    analysisCountByProject[analysis.project_id] = (analysisCountByProject[analysis.project_id] ?? 0) + 1

    if (!latestByProject[analysis.project_id]) {
      latestByProject[analysis.project_id] = analysis
    }

    if (analysis.status === 'done' && (analysis.analytics_status === 'done' || analysis.analytics_status === 'partial')) {
      const current = reportableByProject.get(analysis.project_id) ?? []
      current.push(analysis)
      reportableByProject.set(analysis.project_id, current)
    }
  }

  const reportableAnalysisIds = Array.from(reportableByProject.values())
    .flat()
    .map((analysis) => analysis.id)

  const scoreAverageByAnalysis: Record<string, number> = {}

  if (reportableAnalysisIds.length > 0) {
    const { data: scores, error: scoresError } = await admin
      .from('visibility_scores')
      .select('analysis_id, model_name, subject_type, share_of_model')
      .eq('tenant_id', tenantId)
      .eq('model_name', 'all')
      .eq('subject_type', 'brand')
      .in('analysis_id', reportableAnalysisIds)

    if (scoresError) throw new Error(scoresError.message)

    const grouped = new Map<string, number[]>()
    for (const score of (scores as Array<{ analysis_id: string; share_of_model: number }> | null) ?? []) {
      const current = grouped.get(score.analysis_id) ?? []
      current.push(Number(score.share_of_model) || 0)
      grouped.set(score.analysis_id, current)
    }

    grouped.forEach((values, analysisId) => {
      scoreAverageByAnalysis[analysisId] = average(values)
    })
  }

  const result: Record<string, ProjectReportSummary> = {}

  for (const projectId of projectIds) {
    const latest = latestByProject[projectId]
    const reportable = (reportableByProject.get(projectId) ?? []).sort(sortAnalysesByCompletedAtDesc)
    const latestReport = reportable[0]
    const previousReport = reportable[1]

    result[projectId] = {
      latestAnalysisStatus: latest?.status ?? null,
      latestAnalysisAt: latest?.created_at ?? null,
      latestAnalyticsStatus: latest?.analytics_status ?? null,
      latestShareOfModel: latestReport ? scoreAverageByAnalysis[latestReport.id] ?? null : null,
      trendDelta:
        latestReport && previousReport
          ? roundToTwo(
              (scoreAverageByAnalysis[latestReport.id] ?? 0) -
                (scoreAverageByAnalysis[previousReport.id] ?? 0)
            )
          : null,
      analysisCount: analysisCountByProject[projectId] ?? 0,
    }
  }

  return result
}

export async function getProjectTimeline(
  tenantId: string,
  projectId: string
): Promise<TimelinePoint[]> {
  const admin = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: analyses, error: analysesError } = await admin
    .from('visibility_analyses')
    .select('id, completed_at')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('status', 'done')
    .in('analytics_status', ['done', 'partial'])
    .gte('completed_at', thirtyDaysAgo)
    .order('completed_at', { ascending: true })
    .limit(30)

  if (analysesError) throw new Error(analysesError.message)

  const analysisRows = (analyses as Array<{ id: string; completed_at: string | null }> | null) ?? []
  if (analysisRows.length === 0) return []

  const analysisIds = analysisRows.map((analysis) => analysis.id)

  const { data: scores, error: scoresError } = await admin
    .from('visibility_scores')
    .select('analysis_id, subject_name, subject_type, share_of_model, model_name')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('model_name', 'all')
    .in('analysis_id', analysisIds)

  if (scoresError) throw new Error(scoresError.message)

  const grouped = new Map<string, { analysisId: string; subjectName: string; subjectType: SubjectType; values: number[] }>()

  for (const score of (scores as Array<{
    analysis_id: string
    subject_name: string
    subject_type: SubjectType
    share_of_model: number
  }> | null) ?? []) {
    const key = `${score.analysis_id}::${score.subject_type}::${score.subject_name}`
    const current = grouped.get(key) ?? {
      analysisId: score.analysis_id,
      subjectName: score.subject_name,
      subjectType: score.subject_type,
      values: [],
    }
    current.values.push(Number(score.share_of_model) || 0)
    grouped.set(key, current)
  }

  const analysisCompletedAt = Object.fromEntries(
    analysisRows.map((analysis) => [analysis.id, analysis.completed_at ?? new Date().toISOString()])
  )

  const sortedBase = Array.from(grouped.values())
    .map((entry) => ({
      analysis_id: entry.analysisId,
      completed_at: analysisCompletedAt[entry.analysisId],
      subject_name: entry.subjectName,
      subject_type: entry.subjectType,
      share_of_model: roundToTwo(average(entry.values)),
    }))
    .sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime())

  const previousBySubject = new Map<string, number>()

  return sortedBase.map((entry) => {
    const key = `${entry.subject_type}::${entry.subject_name}`
    const previous = previousBySubject.get(key)
    previousBySubject.set(key, entry.share_of_model)

    return {
      ...entry,
      delta_previous: previous === undefined ? null : roundToTwo(entry.share_of_model - previous),
    }
  })
}

export async function getReportPayload(
  tenantId: string,
  analysisId: string
): Promise<ReportPayload> {
  const admin = createAdminClient()

  const { data: analysis, error: analysisError } = await admin
    .from('visibility_analyses')
    .select(
      'id, tenant_id, project_id, status, analytics_status, analytics_error_message, created_at, completed_at, analytics_completed_at'
    )
    .eq('tenant_id', tenantId)
    .eq('id', analysisId)
    .maybeSingle()

  if (analysisError || !analysis) {
    throw new Error('Analyse nicht gefunden.')
  }

  const analysisRow = analysis as AnalysisSummaryRow

  const [{ data: project }, { data: tenant }, { data: scores }, { data: sources }, { data: recommendations }] =
    await Promise.all([
      admin
        .from('visibility_projects')
        .select('id, brand_name, website_url, competitors, keywords')
        .eq('tenant_id', tenantId)
        .eq('id', analysisRow.project_id)
        .maybeSingle(),
      admin
        .from('tenants')
        .select('id, name, logo_url')
        .eq('id', tenantId)
        .maybeSingle(),
      admin
        .from('visibility_scores')
        .select('analysis_id, keyword, model_name, subject_type, subject_name, share_of_model, geo_score')
        .eq('tenant_id', tenantId)
        .eq('analysis_id', analysisId)
        .order('keyword', { ascending: true }),
      admin
        .from('visibility_sources')
        .select('source_domain, mention_count, is_source_gap, mentioned_subjects')
        .eq('tenant_id', tenantId)
        .eq('analysis_id', analysisId)
        .order('mention_count', { ascending: false })
        .limit(20),
      admin
        .from('visibility_recommendations')
        .select('id, priority, title, description, rationale, related_keyword, status, sort_order')
        .eq('tenant_id', tenantId)
        .eq('analysis_id', analysisId)
        .order('sort_order', { ascending: true }),
    ])

  if (!project || !tenant) {
    throw new Error('Projekt- oder Tenant-Daten konnten nicht geladen werden.')
  }

  return {
    tenant: tenant as TenantBrandingRow,
    project: project as ProjectRow,
    analysis: analysisRow,
    scores: ((scores as ScoreRow[] | null) ?? []).map((row) => ({
      ...row,
      share_of_model: Number(row.share_of_model) || 0,
      geo_score: row.geo_score === null ? null : Number(row.geo_score) || 0,
    })),
    sources: ((sources as SourceRow[] | null) ?? []).map((row) => ({
      ...row,
      mention_count: Number(row.mention_count) || 0,
      mentioned_subjects: (row.mentioned_subjects ?? []) as SourceMention[],
    })),
    recommendations: (recommendations as RecommendationRow[] | null) ?? [],
    timeline: await getProjectTimeline(tenantId, analysisRow.project_id),
  }
}

export function buildReportPdf(payload: ReportPayload): Uint8Array {
  const brandRows = payload.scores.filter(
    (row) => row.model_name === 'all' && row.subject_type === 'brand'
  )
  const competitorRows = payload.scores.filter(
    (row) => row.model_name === 'all' && row.subject_type === 'competitor'
  )
  const averageBrandSom = roundToTwo(average(brandRows.map((row) => row.share_of_model)))
  const averageGeoScore = roundToTwo(
    average(brandRows.map((row) => row.geo_score ?? 0).filter((value) => value > 0))
  )
  const strongestCompetitor = aggregateBySubject(competitorRows)[0] ?? null
  const sourceGapCount = payload.sources.filter((source) => source.is_source_gap).length
  const openRecommendations = payload.recommendations.filter((item) => item.status === 'open').length

  const benchmarkLines = buildBenchmarkLines(payload.scores, payload.project.brand_name)
  const timelineLines = buildTimelineLines(payload.timeline)
  const recommendationLines = payload.recommendations.slice(0, 5).map((item, index) => {
    const keywordSuffix = item.related_keyword ? ` [${item.related_keyword}]` : ''
    return `${index + 1}. ${item.title}${keywordSuffix} (${item.priority})`
  })
  const sourceGapLines = payload.sources
    .filter((source) => source.is_source_gap)
    .slice(0, 5)
    .map((source) => `${source.source_domain} (${source.mention_count} Nennungen)`)

  const lines = [
    `AI Visibility Report`,
    `${payload.project.brand_name} | ${payload.tenant.name}`,
    `Erstellt am ${formatDateTime(new Date().toISOString())}`,
    payload.tenant.logo_url ? `Logo: ${payload.tenant.logo_url}` : 'Logo: kein Tenant-Logo hinterlegt',
    '',
    'Executive Summary',
    `Brand-SOM Durchschnitt: ${formatPercent(averageBrandSom)}`,
    `GEO-Score Durchschnitt: ${formatPercent(averageGeoScore)}`,
    `Stärkster Wettbewerber: ${
      strongestCompetitor
        ? `${strongestCompetitor.subject_name} (${formatPercent(strongestCompetitor.share_of_model)})`
        : 'kein Wettbewerberwert verfügbar'
    }`,
    `Offene Empfehlungen: ${openRecommendations}`,
    `Source Gaps: ${sourceGapCount}`,
    '',
    'Benchmark-Matrix',
    ...(benchmarkLines.length > 0 ? benchmarkLines : ['Keine Benchmark-Daten verfügbar.']),
    '',
    'Timeline (30 Tage)',
    ...(timelineLines.length > 0 ? timelineLines : ['Keine Verlaufspunkte verfügbar.']),
    '',
    'Top Empfehlungen',
    ...(recommendationLines.length > 0 ? recommendationLines : ['Keine Empfehlungen verfügbar.']),
    '',
    'Top Source Gaps',
    ...(sourceGapLines.length > 0 ? sourceGapLines : ['Keine Source Gaps vorhanden.']),
  ]

  return createSimplePdf(lines)
}

function buildBenchmarkLines(scores: ScoreRow[], brandName: string): string[] {
  const aggregateRows = scores.filter((row) => row.model_name === 'all')
  const grouped = new Map<string, ScoreRow[]>()

  for (const row of aggregateRows) {
    const current = grouped.get(row.keyword) ?? []
    current.push(row)
    grouped.set(row.keyword, current)
  }

  return Array.from(grouped.entries())
    .slice(0, 10)
    .map(([keyword, rows]) => {
      const brand = rows.find((row) => row.subject_type === 'brand')?.share_of_model ?? 0
      const competitors = rows
        .filter((row) => row.subject_type === 'competitor')
        .sort((a, b) => b.share_of_model - a.share_of_model)
        .slice(0, 3)
        .map((row) => `${row.subject_name} ${formatPercent(row.share_of_model)}`)
        .join(', ')

      return `${keyword}: ${brandName} ${formatPercent(brand)}${competitors ? ` | ${competitors}` : ''}`
    })
}

function buildTimelineLines(points: TimelinePoint[]): string[] {
  return points
    .filter((point) => point.subject_type === 'brand')
    .slice(-8)
    .map((point) => {
      const delta =
        point.delta_previous === null
          ? 'Startwert'
          : point.delta_previous >= 0
            ? `+${formatPercent(point.delta_previous)}`
            : formatPercent(point.delta_previous)
      return `${formatDate(point.completed_at)}: ${point.subject_name} ${formatPercent(point.share_of_model)} (${delta})`
    })
}

function aggregateBySubject(rows: ScoreRow[]) {
  const grouped = new Map<string, number[]>()
  for (const row of rows) {
    const current = grouped.get(row.subject_name) ?? []
    current.push(row.share_of_model)
    grouped.set(row.subject_name, current)
  }

  return Array.from(grouped.entries())
    .map(([subject_name, values]) => ({
      subject_name,
      share_of_model: roundToTwo(average(values)),
    }))
    .sort((a, b) => b.share_of_model - a.share_of_model)
}

function createSimplePdf(lines: string[]): Uint8Array {
  const normalizedLines = lines.map(toAsciiPdfText)
  const maxLinesPerPage = 40
  const pages = chunk(normalizedLines, maxLinesPerPage)
  const objects: string[] = []

  objects.push('<< /Type /Catalog /Pages 2 0 R >>')

  const pageObjectIds: number[] = []
  const fontObjectId = 3 + pages.length * 2

  pages.forEach((pageLines, index) => {
    const pageObjectId = 3 + index * 2
    const contentObjectId = pageObjectId + 1
    pageObjectIds.push(pageObjectId)

    const content = buildPdfTextStream(pageLines)
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentObjectId} 0 R /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> >>`)
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  })

  objects.splice(1, 0, `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`)
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  let pdf = '%PDF-1.4\n'
  const offsets = [0]

  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let index = 1; index < offsets.length; index++) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return new TextEncoder().encode(pdf)
}

function buildPdfTextStream(lines: string[]): string {
  const commands = ['BT', '/F1 12 Tf', '50 790 Td', '14 TL']
  lines.forEach((line, index) => {
    if (index === 0) {
      commands.push(`(${escapePdfText(line)}) Tj`)
    } else {
      commands.push('T*')
      commands.push(`(${escapePdfText(line)}) Tj`)
    }
  })
  commands.push('ET')
  return commands.join('\n')
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function toAsciiPdfText(value: string): string {
  return value
    .replace(/ß/g, 'ss')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100
}

function sortAnalysesByCompletedAtDesc(a: AnalysisSummaryRow, b: AnalysisSummaryRow) {
  return new Date(b.completed_at ?? b.created_at).getTime() - new Date(a.completed_at ?? a.created_at).getTime()
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
