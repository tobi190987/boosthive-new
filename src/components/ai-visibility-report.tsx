'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Download,
  ExternalLink,
  FileText,
  Info,
  LineChart,
  Minus,
  Sparkles,
  Target,
} from 'lucide-react'
import { modelLabel, type AnalyticsStatus, type VisibilityAnalysis, type VisibilityProject } from '@/lib/ai-visibility'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { readSessionCache, writeSessionCache } from '@/lib/client-cache'

type ScoreRow = {
  analysis_id: string
  keyword: string
  model_name: string
  subject_type: 'brand' | 'competitor'
  subject_name: string
  share_of_model: number
  sentiment_positive: number
  sentiment_neutral: number
  sentiment_negative: number
  geo_score: number | null
}

type SourceMention = {
  type?: string
  name?: string
  mentioned?: boolean
}

type SourceRow = {
  source_domain: string
  source_url: string | null
  mentioned_subjects: SourceMention[]
  mention_count: number
  is_source_gap: boolean
}

type RecommendationRow = {
  id: string
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  rationale: string
  related_keyword: string | null
  status: 'open' | 'done'
}

type AnalyticsDetailResponse = {
  analysis: {
    id: string
    status: string
    analytics_status: AnalyticsStatus
    analytics_error_message: string | null
    analytics_completed_at: string | null
    completed_at: string | null
  }
  scores: ScoreRow[]
  sources: SourceRow[]
  recommendations: RecommendationRow[]
}

type TimelineSeriesPoint = {
  analysisId: string
  completedAt: string
  value: number
}

type TimelineSeries = {
  subjectName: string
  subjectType: 'brand' | 'competitor'
  points: TimelineSeriesPoint[]
}

type TimelineSeriesColor = {
  line: string
  badge: string
  text: string
}

type TimelineApiPoint = {
  analysis_id: string
  completed_at: string
  subject_name: string
  subject_type: 'brand' | 'competitor'
  share_of_model: number
  delta_previous: number | null
}

const BRAND_TIMELINE_COLOR: TimelineSeriesColor = {
  line: '#2563eb',
  badge: 'bg-blue-50',
  text: 'text-blue-600',
}

const COMPETITOR_TIMELINE_COLORS: TimelineSeriesColor[] = [
  { line: '#94a3b8', badge: 'bg-slate-100 dark:bg-[#1e2635]', text: 'text-slate-400 dark:text-slate-500' },
  { line: '#2563eb', badge: 'bg-[#eff6ff]', text: 'text-[#2563eb]' },
  { line: '#c2554d', badge: 'bg-red-50', text: 'text-red-600' },
  { line: '#7c3aed', badge: 'bg-violet-50', text: 'text-violet-600' },
]

interface AiVisibilityReportProps {
  project: VisibilityProject
  analyses: VisibilityAnalysis[]
  selectedAnalysisId: string | null
  onSelectAnalysis: (analysisId: string) => void
  onRefreshAnalyses?: () => Promise<void> | void
}

export function AiVisibilityReport({
  project,
  analyses,
  selectedAnalysisId,
  onSelectAnalysis,
  onRefreshAnalyses,
}: AiVisibilityReportProps) {
  const { toast } = useToast()
  const [detail, setDetail] = useState<AnalyticsDetailResponse | null>(null)
  const [timelineSeries, setTimelineSeries] = useState<TimelineSeries[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [loadingTimeline, setLoadingTimeline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [modelFilter, setModelFilter] = useState('all')
  const [localRecommendationStatus, setLocalRecommendationStatus] = useState<Record<string, 'open' | 'done'>>({})
  const [savingRecommendationIds, setSavingRecommendationIds] = useState<Record<string, boolean>>({})
  const [hiddenTimelineSeries, setHiddenTimelineSeries] = useState<string[]>([])

  const timelineColorMap = useMemo(() => {
    const map = new Map<string, TimelineSeriesColor>()
    let competitorIndex = 0

    for (const entry of timelineSeries) {
      if (entry.subjectType === 'brand') {
        map.set(entry.subjectName, BRAND_TIMELINE_COLOR)
        continue
      }

      map.set(
        entry.subjectName,
        COMPETITOR_TIMELINE_COLORS[competitorIndex % COMPETITOR_TIMELINE_COLORS.length]
      )
      competitorIndex++
    }

    return map
  }, [timelineSeries])

  const visibleTimelineSeries = useMemo(
    () => timelineSeries.filter((entry) => !hiddenTimelineSeries.includes(entry.subjectName)),
    [hiddenTimelineSeries, timelineSeries]
  )

  const reportableAnalyses = useMemo(
    () =>
      analyses.filter(
        (analysis) =>
          analysis.status === 'done' &&
          (analysis.analytics_status === 'done' || analysis.analytics_status === 'partial')
      ),
    [analyses]
  )

  const selectedAnalysis = useMemo(
    () =>
      analyses.find((analysis) => analysis.id === selectedAnalysisId) ??
      reportableAnalyses[0] ??
      null,
    [analyses, reportableAnalyses, selectedAnalysisId]
  )
  const detailCacheKey = selectedAnalysis?.id ? `ai-visibility:report:${selectedAnalysis.id}` : null
  const timelineCacheKey = `ai-visibility:timeline:${project.id}`

  const availableModels = useMemo(() => {
    if (!detail) return ['all']
    const models = Array.from(
      new Set(detail.scores.map((score) => score.model_name).filter((name) => name !== 'all'))
    )
    return ['all', ...models]
  }, [detail])

  useEffect(() => {
    if (!selectedAnalysisId && reportableAnalyses[0]) {
      onSelectAnalysis(reportableAnalyses[0].id)
    }
  }, [onSelectAnalysis, reportableAnalyses, selectedAnalysisId])

  useEffect(() => {
    if (!availableModels.includes(modelFilter)) {
      setModelFilter('all')
    }
  }, [availableModels, modelFilter])

  const fetchDetail = useCallback(async () => {
    if (!selectedAnalysis?.id) {
      setDetail(null)
      return
    }

    setLoadingDetail(true)
    setError(null)

    try {
      const res = await fetch(`/api/tenant/visibility/analyses/${selectedAnalysis.id}/analytics`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Fehler ${res.status}`)
      }

      const data: AnalyticsDetailResponse = await res.json()
      setDetail(data)
      if (detailCacheKey) {
        writeSessionCache(detailCacheKey, data)
      }
      setLocalRecommendationStatus(
        Object.fromEntries(
          (data.recommendations ?? []).map((recommendation) => [recommendation.id, recommendation.status])
        )
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reportdaten konnten nicht geladen werden.')
      setDetail(null)
    } finally {
      setLoadingDetail(false)
    }
  }, [selectedAnalysis?.id])

  const fetchTimeline = useCallback(async () => {
    if (reportableAnalyses.length === 0) {
      setTimelineSeries([])
      return
    }

    setLoadingTimeline(true)
    try {
      const res = await fetch(`/api/tenant/visibility/projects/${project.id}/timeline`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Fehler ${res.status}`)
      }

      const payload = (await res.json()) as { timeline?: TimelineApiPoint[] }
      const seriesMap = new Map<string, TimelineSeries>()
      for (const point of payload.timeline ?? []) {
        const key = `${point.subject_type}::${point.subject_name}`
        const existing = seriesMap.get(key) ?? {
          subjectName: point.subject_name,
          subjectType: point.subject_type,
          points: [],
        }

        existing.points.push({
          analysisId: point.analysis_id,
          completedAt: point.completed_at,
          value: point.share_of_model,
        })

        seriesMap.set(key, existing)
      }

      const nextTimeline = Array.from(seriesMap.values()).map((series) => ({
          ...series,
          points: series.points.sort(
            (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
          ),
        }))
      setTimelineSeries(nextTimeline)
      writeSessionCache(timelineCacheKey, nextTimeline)
    } catch (err) {
      toast({
        title: 'Timeline konnte nicht geladen werden',
        description: err instanceof Error ? err.message : 'Verlauf ist aktuell nicht verfügbar.',
        variant: 'destructive',
      })
      setTimelineSeries([])
    } finally {
      setLoadingTimeline(false)
    }
  }, [project.id, reportableAnalyses.length, timelineCacheKey, toast])

  useEffect(() => {
    if (detailCacheKey) {
      const cachedDetail = readSessionCache<AnalyticsDetailResponse>(detailCacheKey)
      if (cachedDetail) {
        setDetail(cachedDetail)
        setLocalRecommendationStatus(
          Object.fromEntries(
            (cachedDetail.recommendations ?? []).map((recommendation) => [recommendation.id, recommendation.status])
          )
        )
        setLoadingDetail(false)
        return
      }
    }

    void fetchDetail()
  }, [detailCacheKey, fetchDetail])

  useEffect(() => {
    const cachedTimeline = readSessionCache<TimelineSeries[]>(timelineCacheKey)
    if (cachedTimeline) {
      setTimelineSeries(cachedTimeline)
      setLoadingTimeline(false)
      return
    }

    void fetchTimeline()
  }, [fetchTimeline, timelineCacheKey])

  useEffect(() => {
    setHiddenTimelineSeries((prev) =>
      prev.filter((subjectName) => timelineSeries.some((entry) => entry.subjectName === subjectName))
    )
  }, [timelineSeries])

  useEffect(() => {
    if (!onRefreshAnalyses) return

    const hasAnalyticsInProgress = analyses.some(
      (analysis) =>
        analysis.status === 'done' &&
        (analysis.analytics_status === 'pending' || analysis.analytics_status === 'running')
    )

    const shouldPoll = hasAnalyticsInProgress || (analyses.length > 0 && reportableAnalyses.length === 0)
    if (!shouldPoll) return

    const intervalId = window.setInterval(() => {
      void onRefreshAnalyses()
    }, 5000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [analyses, onRefreshAnalyses, reportableAnalyses.length])

  const filteredScores = useMemo(() => {
    if (!detail) return []
    return detail.scores.filter((score) => score.model_name === modelFilter)
  }, [detail, modelFilter])

  const benchmarkRows = useMemo(() => {
    const grouped = new Map<string, Map<string, ScoreRow>>()

    for (const score of filteredScores) {
      const byKeyword = grouped.get(score.keyword) ?? new Map<string, ScoreRow>()
      byKeyword.set(`${score.subject_type}::${score.subject_name}`, score)
      grouped.set(score.keyword, byKeyword)
    }

    return Array.from(grouped.entries()).map(([keyword, values]) => {
      const brand =
        values.get(`brand::${project.brand_name}`) ??
        Array.from(values.values()).find((value) => value.subject_type === 'brand') ??
        null
      const competitors = Array.from(values.values()).filter((value) => value.subject_type === 'competitor')
      const maxCompetitor = competitors.reduce((max, item) => Math.max(max, item.share_of_model), 0)

      return {
        keyword,
        brand,
        competitors,
        isGap: !!brand && maxCompetitor > brand.share_of_model,
      }
    })
  }, [filteredScores, project.brand_name])

  const keywordGaps = useMemo(
    () =>
      benchmarkRows
        .filter((row) => row.brand)
        .map((row) => {
          const strongestCompetitor = row.competitors.reduce<ScoreRow | null>((current, candidate) => {
            if (!current || candidate.share_of_model > current.share_of_model) return candidate
            return current
          }, null)

          return {
            keyword: row.keyword,
            brandScore: row.brand?.share_of_model ?? 0,
            competitorName: strongestCompetitor?.subject_name ?? null,
            competitorScore: strongestCompetitor?.share_of_model ?? 0,
            delta:
              (strongestCompetitor?.share_of_model ?? 0) - (row.brand?.share_of_model ?? 0),
          }
        })
        .filter((row) => row.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5),
    [benchmarkRows]
  )

  const summary = useMemo(() => {
    if (!detail) return null

    const aggregateRows = detail.scores.filter((score) => score.model_name === 'all')
    const brandRows = aggregateRows.filter((score) => score.subject_type === 'brand')
    const competitorRows = aggregateRows.filter((score) => score.subject_type === 'competitor')
    const openRecommendations = detail.recommendations.filter(
      (recommendation) => (localRecommendationStatus[recommendation.id] ?? recommendation.status) === 'open'
    )
    const brandSourceCount = detail.sources.filter((source) => sourceMentionsBrand(source)).length

    const strongestCompetitor = aggregateBestBySubject(competitorRows)[0] ?? null

    return {
      brandVisibility: average(brandRows.map((row) => row.share_of_model)),
      strongestCompetitor,
      openRecommendations: openRecommendations.length,
      geoScore: average(brandRows.map((row) => row.geo_score ?? 0)),
      brandSentimentPositive: average(brandRows.map((row) => row.sentiment_positive)),
      brandSentimentNeutral: average(brandRows.map((row) => row.sentiment_neutral)),
      brandSentimentNegative: average(brandRows.map((row) => row.sentiment_negative)),
      brandSourceCoverage:
        detail.sources.length > 0 ? Math.round((brandSourceCount / detail.sources.length) * 100) : 0,
    }
  }, [detail, localRecommendationStatus])

  const sentimentSummary = useMemo(() => {
    if (!summary) return null

    if (summary.brandSentimentNegative >= summary.brandSentimentPositive + 10) {
      return {
        label: 'Kritisch',
        tone: 'amber' as const,
      }
    }

    if (summary.brandSentimentPositive >= summary.brandSentimentNegative + 10) {
      return {
        label: 'Positiv',
        tone: 'teal' as const,
      }
    }

    return {
      label: 'Gemischt',
      tone: 'slate' as const,
    }
  }, [summary])

  const executiveSummary = useMemo(() => {
    if (!summary) return null

    const strength =
      summary.brandVisibility >= 60
        ? `Deine Brand ist mit ${formatPercent(summary.brandVisibility)} bereits stark in den KI-Antworten sichtbar.`
        : `Deine Brand erreicht aktuell ${formatPercent(summary.brandVisibility)} Sichtbarkeit und hat damit noch klares Ausbaupotenzial.`

    const competitor =
      summary.strongestCompetitor
        ? `${summary.strongestCompetitor.subject_name} ist derzeit der stärkste Wettbewerber mit ${formatPercent(summary.strongestCompetitor.share_of_model)}.`
        : 'Aktuell ist kein dominanter Wettbewerber erkennbar.'

    const sourceCoverage =
      summary.brandSourceCoverage > 0
        ? `Der Brand-Quellenanteil liegt bei ${summary.brandSourceCoverage}%, hier ist also bereits erste Quellenpräsenz vorhanden.`
        : 'Beim Brand-Quellenanteil gibt es mit 0% noch die größte Lücke, weil deine Brand in den erkannten Quellen bislang nicht auftaucht.'

    const recommendationHint =
      summary.openRecommendations > 0
        ? `Priorisiere als Nächstes die ${summary.openRecommendations} offenen GEO-Empfehlungen, um Quellenpräsenz und Wettbewerbsabstand gezielt zu verbessern.`
        : 'Die offenen GEO-Empfehlungen sind bereits abgearbeitet; jetzt lohnt sich vor allem der Blick auf Quellenpräsenz und den Abstand zum stärksten Wettbewerber.'

    return `${strength} ${competitor} ${sourceCoverage} ${recommendationHint}`
  }, [summary])

  async function handleExport() {
    if (!selectedAnalysis?.id || exporting) return
    setExporting(true)

    try {
      const res = await fetch(`/api/tenant/visibility/analyses/${selectedAnalysis.id}/report`)
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? 'Der PDF-Endpoint ist im Backend noch nicht vorhanden.'
            : `Export fehlgeschlagen (${res.status}).`
        )
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      const dateLabel = new Date().toISOString().slice(0, 10)
      link.href = url
      link.download = `${project.brand_name}-AI-Visibility-Report-${dateLabel}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      toast({
        title: 'PDF-Export nicht verfügbar',
        description: err instanceof Error ? err.message : 'Der Report konnte nicht exportiert werden.',
        variant: 'destructive',
      })
    } finally {
      setExporting(false)
    }
  }

  async function toggleRecommendationStatus(id: string) {
    const nextStatus = (localRecommendationStatus[id] ?? 'open') === 'done' ? 'open' : 'done'

    setSavingRecommendationIds((prev) => ({ ...prev, [id]: true }))
    setLocalRecommendationStatus((prev) => ({
      ...prev,
      [id]: nextStatus,
    }))

    try {
      const res = await fetch(`/api/tenant/visibility/recommendations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Fehler ${res.status}`)
      }
    } catch (err) {
      setLocalRecommendationStatus((prev) => ({
        ...prev,
        [id]: nextStatus === 'done' ? 'open' : 'done',
      }))
      toast({
        title: 'Empfehlung konnte nicht aktualisiert werden',
        description:
          err instanceof Error ? err.message : 'Der Statuswechsel wurde nicht gespeichert.',
        variant: 'destructive',
      })
    } finally {
      setSavingRecommendationIds((prev) => ({ ...prev, [id]: false }))
    }
  }

  if (analyses.length === 0) {
    return (
      <Card className="rounded-2xl border border-dashed border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-sm">
        <CardContent className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white dark:bg-[#151c28] shadow-sm">
            <LineChart className="h-6 w-6 text-blue-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Noch keine Reports verfügbar</h3>
            <p className="max-w-xl text-sm leading-7 text-slate-500 dark:text-slate-400">
              Starte die erste Analyse, damit wir SOM, Quellen, Empfehlungen und den zeitlichen Verlauf für dieses Projekt visualisieren können.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!selectedAnalysis) {
    return (
      <Alert className="rounded-2xl border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
        <FileText className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <AlertTitle>Ergebnisse werden vorbereitet</AlertTitle>
        <AlertDescription className="text-slate-600 dark:text-slate-300">
          Für dieses Projekt gibt es bereits Analysen, aber noch keinen abgeschlossenen Analytics-Stand für die Reporting-Ansicht.
        </AlertDescription>
      </Alert>
    )
  }

  if (selectedAnalysis.status !== 'done') {
    return (
      <Alert className="rounded-2xl border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
        <FileText className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <AlertTitle>Für diese Analyse liegt noch kein Report vor</AlertTitle>
        <AlertDescription className="text-slate-600 dark:text-slate-300">
          Wähle eine abgeschlossene Analyse mit fertigem Analytics-Stand aus, um Benchmark, Quellen und Empfehlungen zu sehen.
        </AlertDescription>
      </Alert>
    )
  }

  if (selectedAnalysis.analytics_status === 'pending' || selectedAnalysis.analytics_status === 'running') {
    return (
      <Alert className="rounded-2xl border-blue-200 bg-blue-50">
        <Sparkles className="h-4 w-4 text-blue-600" />
        <AlertTitle>Ergebnisse werden aufbereitet</AlertTitle>
        <AlertDescription className="text-blue-800">
          Die Rohanalyse ist abgeschlossen, die Analytics-Schicht berechnet aber gerade noch Scores, Quellen und Empfehlungen.
        </AlertDescription>
      </Alert>
    )
  }

  if (selectedAnalysis.analytics_status === 'failed') {
    return (
      <Alert variant="destructive" className="rounded-2xl">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Analytics fehlgeschlagen</AlertTitle>
        <AlertDescription>
          Die Ergebnisaufbereitung für diese Analyse ist fehlgeschlagen. Bitte starte das Reprocessing im Backend oder führe die Analyse erneut aus.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-white dark:bg-[#151c28] px-3 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#1e2635]">
              Report
            </Badge>
            <Badge className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-600 hover:bg-blue-50">
              {selectedAnalysis.analytics_status === 'partial' ? 'Teilweise berechnet' : 'Bereit'}
            </Badge>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-950 dark:text-slate-50">AI Visibility Report</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Analyse vom {formatDate(selectedAnalysis.completed_at ?? selectedAnalysis.created_at)} mit Benchmark, Verlauf, Quellen und GEO-Empfehlungen.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {reportableAnalyses.length > 1 && (
            <select
              value={selectedAnalysis.id}
              onChange={(event) => onSelectAnalysis(event.target.value)}
              className="h-10 rounded-full border border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] px-4 text-sm text-slate-700 dark:text-slate-300 shadow-sm outline-none"
            >
              {reportableAnalyses.map((analysis) => (
                <option key={analysis.id} value={analysis.id}>
                  {formatDate(analysis.completed_at ?? analysis.created_at)}
                </option>
              ))}
            </select>
          )}
          <Button
            onClick={handleExport}
            disabled={exporting}
            className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
          >
            <Download className="mr-1.5 h-4 w-4" />
            {exporting ? 'Export läuft...' : 'PDF exportieren'}
          </Button>
        </div>
      </div>

      {loadingDetail && (
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
      )}

      {error && !detail && (
        <Alert variant="destructive" className="rounded-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Reportdaten konnten nicht geladen werden</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {detail && summary && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              title="Brand-SOM"
              value={formatPercent(summary.brandVisibility)}
              tone="teal"
              icon={<Target className="h-4 w-4" />}
              description="Durchschnittliche Sichtbarkeit der Brand über alle Keywords."
            />
            <MetricCard
              title="Stärkster Wettbewerber"
              value={
                summary.strongestCompetitor
                  ? `${summary.strongestCompetitor.subject_name} ${formatPercent(summary.strongestCompetitor.share_of_model)}`
                  : 'Kein Vergleich'
              }
              tone="amber"
              icon={<Sparkles className="h-4 w-4" />}
              description="Höchster aggregierter Wettbewerber-Wert im aktuellen Lauf."
            />
            <MetricCard
              title="Offene Empfehlungen"
              value={String(summary.openRecommendations)}
              tone="slate"
              icon={<FileText className="h-4 w-4" />}
              description="Noch offene Maßnahmen im GEO-Backlog dieser Analyse."
            />
            <MetricCard
              title="Brand-Quellenanteil"
              value={`${summary.brandSourceCoverage}%`}
              tone="rose"
              icon={<ExternalLink className="h-4 w-4" />}
              description={`GEO-Score Ø ${formatPercent(summary.geoScore)}.`}
              tooltip="Zeigt, in wie viel Prozent der erkannten Quellen deine Brand überhaupt genannt wird. Ein hoher Wert spricht für starke Quellenpräsenz."
            />
            {sentimentSummary && (
              <MetricCard
                title="Sentiment-Check"
                value={sentimentSummary.label}
                tone={sentimentSummary.tone}
                icon={<Sparkles className="h-4 w-4" />}
                description={`Positiv ${formatPercent(summary.brandSentimentPositive)} · Neutral ${formatPercent(summary.brandSentimentNeutral)} · Negativ ${formatPercent(summary.brandSentimentNegative)}.`}
                tooltip="Zeigt die durchschnittliche Tonalität, mit der deine Brand in den KI-Antworten erwähnt wird."
              />
            )}
          </div>

          {executiveSummary && (
            <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-sm">
              <CardContent className="space-y-2 p-5">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Fazit</p>
                <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">{executiveSummary}</p>
              </CardContent>
            </Card>
          )}

          <Tabs value={modelFilter} onValueChange={setModelFilter}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">Benchmark und Insights</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Filtere zwischen aggregierter Sicht und einzelnen Modellen.
                </p>
              </div>
              <TabsList className="h-auto flex-wrap rounded-full bg-slate-50 dark:bg-[#151c28] p-1">
                {availableModels.map((model) => (
                  <TabsTrigger
                    key={model}
                    value={model}
                    className="rounded-full px-4 py-2 text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-[#1e2635]"
                  >
                    {model === 'all' ? 'Alle Modelle' : modelLabel(model)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {availableModels.map((model) => (
              <TabsContent key={model} value={model} className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
                  <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        <SectionTitleWithTooltip
                          title="Benchmark-Matrix"
                          tooltip="Vergleicht die durchschnittliche Sichtbarkeit deiner Brand mit den Wettbewerbern pro Keyword. Höherer Prozentwert bedeutet häufigere Nennung in KI-Antworten."
                        />
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Keyword</TableHead>
                            <TableHead>{project.brand_name}</TableHead>
                            {project.competitors.map((competitor) => (
                              <TableHead key={competitor.name}>{competitor.name}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {benchmarkRows.map((row) => (
                            <TableRow key={row.keyword} className={row.isGap ? 'bg-orange-50 dark:bg-orange-950/20' : undefined}>
                              <TableCell className="font-medium text-slate-900 dark:text-slate-100">{row.keyword}</TableCell>
                              <TableCell>
                                {row.brand ? (
                                  <ScorePill score={row.brand.share_of_model} sentiment={sentimentTone(row.brand)} />
                                ) : (
                                  <span className="text-sm text-slate-300">-</span>
                                )}
                              </TableCell>
                              {project.competitors.map((competitor) => {
                                const score = row.competitors.find(
                                  (entry) => entry.subject_name === competitor.name
                                )
                                return (
                                  <TableCell key={competitor.name}>
                                    {score ? (
                                      <ScorePill score={score.share_of_model} sentiment={sentimentTone(score)} />
                                    ) : (
                                      <span className="text-sm text-slate-300">-</span>
                                    )}
                                  </TableCell>
                                )
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        <SectionTitleWithTooltip
                          title="Keyword-Gaps"
                          tooltip="Hebt Keywords hervor, bei denen ein Wettbewerber aktuell sichtbarer ist als deine Brand. Die Differenz zeigt die Größe der Lücke."
                        />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {keywordGaps.length === 0 && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Aktuell gibt es in diesem Modell-Filter keine sichtbaren Wettbewerber-Lücken.
                        </p>
                      )}
                      {keywordGaps.map((gap) => (
                        <div key={gap.keyword} className="rounded-xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-900 dark:text-slate-100">{gap.keyword}</p>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                {gap.competitorName} liegt vor der Brand.
                              </p>
                            </div>
                            <TrendBadge delta={gap.delta} />
                          </div>
                          <div className="mt-3 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                            <span>{project.brand_name}: {formatPercent(gap.brandScore)}</span>
                            <span>{gap.competitorName}: {formatPercent(gap.competitorScore)}</span>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                <SectionTitleWithTooltip
                  title="Timeline der letzten 30 Tage"
                  tooltip="Zeigt die Entwicklung der aggregierten Sichtbarkeit pro Brand oder Wettbewerber über abgeschlossene Analysen der letzten 30 Tage."
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingTimeline && <Skeleton className="h-56 rounded-xl" />}
              {!loadingTimeline && timelineSeries.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Für den Verlauf ist mindestens eine abgeschlossene Analytics-Auswertung innerhalb der letzten 30 Tage nötig.
                </p>
              )}
              {!loadingTimeline && timelineSeries.length > 0 && (
                <>
                  <TimelineChart series={visibleTimelineSeries} colorMap={timelineColorMap} />
                  {visibleTimelineSeries.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Aktuell sind alle Reihen ausgeblendet. Klicke unten auf einen Eintrag, um ihn wieder einzublenden.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {timelineSeries.map((series) => (
                      <button
                        key={series.subjectName}
                        type="button"
                        onClick={() =>
                          setHiddenTimelineSeries((prev) =>
                            prev.includes(series.subjectName)
                              ? prev.filter((name) => name !== series.subjectName)
                              : [...prev, series.subjectName]
                          )
                        }
                        className="rounded-full"
                        aria-pressed={!hiddenTimelineSeries.includes(series.subjectName)}
                      >
                        <Badge
                          className={cn(
                            'rounded-full px-3 py-1 text-xs transition hover:opacity-100',
                            timelineColorMap.get(series.subjectName)?.badge ?? BRAND_TIMELINE_COLOR.badge,
                            timelineColorMap.get(series.subjectName)?.text ?? BRAND_TIMELINE_COLOR.text,
                            hiddenTimelineSeries.includes(series.subjectName) && 'opacity-40 saturate-50'
                          )}
                        >
                          <span
                            className="mr-2 inline-block h-2.5 w-2.5 rounded-full border-2 border-white shadow-sm"
                            style={{
                              backgroundColor:
                                timelineColorMap.get(series.subjectName)?.line ?? BRAND_TIMELINE_COLOR.line,
                            }}
                            aria-hidden="true"
                          />
                          {series.subjectName}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">GEO-Empfehlungen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.recommendations.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Für diesen Lauf wurden noch keine Empfehlungen berechnet.
                </p>
              )}
              {detail.recommendations.map((recommendation) => {
                const status = localRecommendationStatus[recommendation.id] ?? recommendation.status
                return (
                  <div
                    key={recommendation.id}
                    className={cn(
                      'rounded-xl border p-4 transition',
                      status === 'done'
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : 'border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <PriorityBadge priority={recommendation.priority} />
                          {recommendation.related_keyword && (
                            <Badge className="rounded-full bg-white dark:bg-[#151c28] px-2.5 py-0.5 text-[11px] text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-[#1e2635]">
                              {recommendation.related_keyword}
                            </Badge>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{recommendation.title}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {recommendation.description}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant={status === 'done' ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => toggleRecommendationStatus(recommendation.id)}
                        disabled={savingRecommendationIds[recommendation.id]}
                        className={cn(
                          'rounded-full',
                          status === 'done'
                            ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                            : 'bg-[#1f2937] text-white hover:bg-[#111827]'
                        )}
                      >
                        {savingRecommendationIds[recommendation.id]
                          ? 'Speichert...'
                          : status === 'done'
                            ? 'Erledigt'
                            : 'Als erledigt markieren'}
                      </Button>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{recommendation.rationale}</p>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                <SectionTitleWithTooltip
                  title="Source Attribution"
                  tooltip="Listet die wichtigsten erkannten Quellen aus den KI-Antworten. So siehst du, welche Domains häufig auftauchen und ob deine Brand dort vertreten ist."
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Nennungen</TableHead>
                    <TableHead>Brand erwähnt</TableHead>
                    <TableHead>Source Gap</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.sources.slice(0, 10).map((source) => (
                    <TableRow key={`${source.source_domain}:${source.source_url ?? 'none'}`}>
                      <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-2">
                          <span>{source.source_domain}</span>
                          {source.source_url && (
                            <a
                              href={source.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-400 dark:text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
                              aria-label={`${source.source_domain} öffnen`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{source.mention_count}</TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-[11px]',
                            sourceMentionsBrand(source)
                              ? 'bg-blue-50 text-blue-600 hover:bg-blue-50'
                              : 'bg-slate-100 dark:bg-[#1e2635] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252d3a]'
                          )}
                        >
                          {sourceMentionsBrand(source) ? 'Ja' : 'Nein'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {source.is_source_gap ? (
                          <Badge className="rounded-full bg-slate-100 dark:bg-[#1e2635] px-2.5 py-0.5 text-[11px] text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252d3a]">
                            Gap
                          </Badge>
                        ) : (
                          <span className="text-sm text-slate-300">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function MetricCard({
  title,
  value,
  description,
  tone,
  icon,
  tooltip,
}: {
  title: string
  value: string
  description: string
  tone: 'teal' | 'amber' | 'slate' | 'rose'
  icon: ReactNode
  tooltip?: string
}) {
  const toneClass =
    tone === 'teal'
      ? 'bg-blue-50 text-blue-600'
      : tone === 'amber'
        ? 'bg-slate-100 dark:bg-[#1e2635] text-slate-400 dark:text-slate-500'
        : tone === 'rose'
          ? 'bg-red-50 text-red-600'
          : 'bg-slate-100 dark:bg-[#1e2635] text-slate-600 dark:text-slate-300'

  return (
    <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-sm">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</span>
            {tooltip && <InfoTooltip content={tooltip} />}
          </div>
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-full', toneClass)}>{icon}</div>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{value}</p>
        <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      </CardContent>
    </Card>
  )
}

function SectionTitleWithTooltip({
  title,
  tooltip,
}: {
  title: string
  tooltip?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span>{title}</span>
      {tooltip && <InfoTooltip content={tooltip} />}
    </div>
  )
}

function InfoTooltip({ content }: { content: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 dark:text-slate-500 transition hover:bg-slate-100 dark:hover:bg-[#252d3a] hover:text-slate-600 dark:hover:text-slate-300"
            aria-label="Mehr Informationen"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-balance">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function ScorePill({ score, sentiment }: { score: number; sentiment: 'positive' | 'neutral' | 'negative' }) {
  const toneClass =
    sentiment === 'positive'
      ? 'bg-blue-50 text-blue-600'
      : sentiment === 'negative'
        ? 'bg-slate-100 dark:bg-[#1e2635] text-slate-400 dark:text-slate-500'
        : 'bg-slate-100 dark:bg-[#1e2635] text-slate-600 dark:text-slate-300'

  return (
    <Badge className={cn('rounded-full px-2.5 py-1 text-xs font-medium hover:opacity-100', toneClass)}>
      {formatPercent(score)}
    </Badge>
  )
}

function PriorityBadge({ priority }: { priority: RecommendationRow['priority'] }) {
  const className =
    priority === 'high'
      ? 'bg-red-50 text-red-700'
      : priority === 'medium'
        ? 'bg-slate-100 dark:bg-[#1e2635] text-slate-400 dark:text-slate-500'
        : 'bg-slate-100 dark:bg-[#1e2635] text-slate-500 dark:text-slate-400'

  return (
    <Badge className={cn('rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-wide hover:opacity-100', className)}>
      {priority}
    </Badge>
  )
}

function TrendBadge({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <Badge className="rounded-full bg-slate-100 dark:bg-[#1e2635] px-2.5 py-1 text-xs text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252d3a]">
        <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
        +{formatPercent(delta)}
      </Badge>
    )
  }

  if (delta < 0) {
    return (
      <Badge className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50">
        <ArrowDownRight className="mr-1 h-3.5 w-3.5" />
        {formatPercent(delta)}
      </Badge>
    )
  }

  return (
    <Badge className="rounded-full bg-slate-100 dark:bg-[#1e2635] px-2.5 py-1 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252d3a]">
      <Minus className="mr-1 h-3.5 w-3.5" />
      Stabil
    </Badge>
  )
}

function TimelineChart({
  series,
  colorMap,
}: {
  series: TimelineSeries[]
  colorMap: Map<string, TimelineSeriesColor>
}) {
  const width = 640
  const height = 220
  const padding = 26
  const allPoints = series.flatMap((entry) => entry.points)
  const allValues = allPoints.map((point) => point.value)
  const maxValue = Math.max(...allValues, 100)
  const minValue = Math.min(...allValues, 0)
  const timeMin = Math.min(...allPoints.map((point) => new Date(point.completedAt).getTime()))
  const timeMax = Math.max(...allPoints.map((point) => new Date(point.completedAt).getTime()))

  function xFor(time: number) {
    if (timeMin === timeMax) return width / 2
    return padding + ((time - timeMin) / (timeMax - timeMin)) * (width - padding * 2)
  }

  function yFor(value: number) {
    if (maxValue === minValue) return height / 2
    return height - padding - ((value - minValue) / (maxValue - minValue)) * (height - padding * 2)
  }

  const overlapOffsets = new Map<string, number>()
  const overlapCounts = new Map<string, number>()

  for (const entry of series) {
    for (const point of entry.points) {
      const x = xFor(new Date(point.completedAt).getTime())
      const y = yFor(point.value)
      const key = `${Math.round(x)}:${Math.round(y)}`
      overlapCounts.set(key, (overlapCounts.get(key) ?? 0) + 1)
    }
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto min-w-[560px]">
        <rect x="0" y="0" width={width} height={height} rx="24" fill="#f8fafc" />
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={padding}
              x2={width - padding}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="#e2e8f0"
              strokeDasharray="4 5"
            />
            <text x="6" y={yFor(tick) + 4} fontSize="10" fill="#94a3b8">
              {tick}%
            </text>
          </g>
        ))}

        {series.map((entry) => {
          const color = colorMap.get(entry.subjectName)?.line ?? BRAND_TIMELINE_COLOR.line
          const points = entry.points
            .map((point) => `${xFor(new Date(point.completedAt).getTime())},${yFor(point.value)}`)
            .join(' ')

          return (
            <g key={entry.subjectName}>
              <polyline
                fill="none"
                stroke={color}
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points}
              />
              {entry.points.map((point) => (
                <g key={point.analysisId}>
                  {(() => {
                    const baseX = xFor(new Date(point.completedAt).getTime())
                    const baseY = yFor(point.value)
                    const overlapKey = `${Math.round(baseX)}:${Math.round(baseY)}`
                    const overlapCount = overlapCounts.get(overlapKey) ?? 1
                    const usedOffsetCount = overlapOffsets.get(overlapKey) ?? 0
                    overlapOffsets.set(overlapKey, usedOffsetCount + 1)
                    const xOffset =
                      overlapCount > 1 ? (usedOffsetCount - (overlapCount - 1) / 2) * 8 : 0
                    const pointX = baseX + xOffset

                    return (
                      <>
                  <circle
                    cx={pointX}
                    cy={baseY}
                    r="5"
                    fill="#ffffff"
                    stroke="#ffffff"
                    strokeWidth="3"
                  />
                  <circle
                    cx={pointX}
                    cy={baseY}
                    r="4"
                    fill={color}
                  />
                  <text
                    x={baseX - 14}
                    y={height - 8}
                    fontSize="10"
                    fill="#94a3b8"
                  >
                    {new Date(point.completedAt).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </text>
                      </>
                    )
                  })()}
                </g>
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function aggregateBestBySubject(rows: ScoreRow[]) {
  const grouped = groupRowsBySubject(rows)
  return Array.from(grouped.entries())
    .map(([key, value]) => {
      const [, subjectName] = key.split('::')
      return {
        subject_name: subjectName,
        share_of_model: average(value.map((row) => row.share_of_model)),
      }
    })
    .sort((a, b) => b.share_of_model - a.share_of_model)
}

function groupRowsBySubject(rows: ScoreRow[]) {
  const grouped = new Map<string, ScoreRow[]>()

  for (const row of rows) {
    const key = `${row.subject_type}::${row.subject_name}`
    const current = grouped.get(key) ?? []
    current.push(row)
    grouped.set(key, current)
  }

  return grouped
}

function sentimentTone(score: ScoreRow) {
  if (score.sentiment_positive > score.sentiment_negative) return 'positive'
  if (score.sentiment_negative > score.sentiment_positive) return 'negative'
  return 'neutral'
}

function sourceMentionsBrand(source: SourceRow) {
  return (source.mentioned_subjects ?? []).some(
    (subject) => subject?.type === 'brand' && subject?.mentioned === true
  )
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatPercent(value: number) {
  return `${value.toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
