'use client'

/**
 * PROJ-67: Brand Mentions & Sentiment Panel
 *
 * Zeigt für das aktive, primäre Brand-Keyword:
 *   • KPI: Gesamt-Sentiment-Score (0–100)
 *   • Donut-Chart: Verteilung positiv / neutral / negativ
 *   • Filter: Quelle (All / News / Blogs / Foren / Social), Zeitraum (7 / 30 / 90 Tage)
 *   • Paginierte Mentions-Liste (20 pro Seite)
 *   • Admin-Panel: Sentiment-Alert-Schwellwert
 *
 * Backend-Endpoints (folgen via /backend):
 *   GET   /api/tenant/brand-mentions?customer_id=…&keyword=…&period=7d|30d|90d
 *   PATCH /api/tenant/brand-keywords/[id]  — body: { sentiment_alert_threshold: number|null }
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  BellRing,
  ExternalLink,
  Newspaper,
  RefreshCw,
  Save,
  Share2,
} from 'lucide-react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'

type Period = '7d' | '30d' | '90d'
type SourceFilter = 'all' | 'news' | 'blog' | 'forum' | 'social'
type SentimentLabel = 'positive' | 'neutral' | 'negative'

interface Mention {
  id: string
  title: string
  url: string
  source: Exclude<SourceFilter, 'all'>
  sourceName: string
  publishedAt: string
  snippet: string
  sentiment: SentimentLabel
}

interface MentionsResponse {
  mentions: Mention[]
  total: number
  truncated: boolean
  sentimentScore: number | null
  distribution: { positive: number; neutral: number; negative: number }
  cachedAt: string | null
  alertThreshold: number | null
  keywordId: string | null
}

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 Tage',
  '30d': '30 Tage',
  '90d': '90 Tage',
}

const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: 'Alle',
  news: 'News',
  blog: 'Blogs',
  forum: 'Foren',
  social: 'Social',
}

const SENTIMENT_LABELS: Record<SentimentLabel, string> = {
  positive: 'Positiv',
  neutral: 'Neutral',
  negative: 'Negativ',
}

const SENTIMENT_COLORS: Record<SentimentLabel, string> = {
  positive: 'rgb(16, 185, 129)',
  neutral: 'rgb(148, 163, 184)',
  negative: 'rgb(244, 63, 94)',
}

const PAGE_SIZE = 20

interface BrandMentionsPanelProps {
  customerId: string
  keyword: string | null
  keywordId: string | null
  isAdmin: boolean
}

export function BrandMentionsPanel({
  customerId,
  keyword,
  keywordId,
  isAdmin,
}: BrandMentionsPanelProps) {
  const { toast } = useToast()

  const [period, setPeriod] = useState<Period>('30d')
  const [source, setSource] = useState<SourceFilter>('all')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<MentionsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMentions = useCallback(
    async (signal?: AbortSignal) => {
      if (!keyword) return
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          customer_id: customerId,
          keyword,
          period,
        })
        const res = await fetch(
          `/api/tenant/brand-mentions?${params.toString()}`,
          { cache: 'no-store', signal }
        )
        if (res.status === 429) {
          throw new Error('API-Limit erreicht. Bitte später erneut versuchen.')
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null
          throw new Error(
            body?.error ?? 'Mentions konnten nicht geladen werden.'
          )
        }
        const payload = (await res.json()) as MentionsResponse
        setData(payload)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler.')
        setData(null)
      } finally {
        setLoading(false)
      }
    },
    [customerId, keyword, period]
  )

  useEffect(() => {
    const controller = new AbortController()
    loadMentions(controller.signal)
    return () => controller.abort()
  }, [loadMentions])

  // Reset Pagination bei Filter-Änderung
  useEffect(() => {
    setPage(1)
  }, [source, period])

  const filteredMentions = useMemo(() => {
    if (!data) return []
    if (source === 'all') return data.mentions
    return data.mentions.filter((m) => m.source === source)
  }, [data, source])

  const pageCount = Math.max(1, Math.ceil(filteredMentions.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pagedMentions = useMemo(
    () =>
      filteredMentions.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
      ),
    [filteredMentions, currentPage]
  )

  if (!keyword) {
    return (
      <Card className="rounded-2xl border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40">
        <CardContent className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <Share2 className="h-6 w-6 text-slate-400" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Kein primäres Keyword gesetzt
          </p>
          <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
            Lege im Tab &bdquo;Trend-Verlauf&ldquo; ein Brand-Keyword an, um Mentions &amp;
            Sentiment anzuzeigen.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Filter-Leiste */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <PeriodTabs period={period} onChange={setPeriod} />
        <SourceTabs source={source} onChange={setSource} />
      </div>

      {/* KPI-Bereich */}
      <div className="grid gap-4 md:grid-cols-3">
        <SentimentScoreCard
          score={data?.sentimentScore ?? null}
          loading={loading}
          error={error}
        />
        <SentimentDonutCard
          distribution={data?.distribution ?? null}
          loading={loading}
        />
        <MetaInfoCard
          total={data?.total ?? 0}
          truncated={data?.truncated ?? false}
          cachedAt={data?.cachedAt ?? null}
          onRefresh={() => loadMentions()}
          loading={loading}
        />
      </div>

      {/* Mentions-Liste */}
      <MentionsList
        mentions={pagedMentions}
        totalFiltered={filteredMentions.length}
        page={currentPage}
        pageCount={pageCount}
        onPageChange={setPage}
        loading={loading}
        error={error}
        emptyCachedAt={data?.cachedAt ?? null}
        onRetry={() => loadMentions()}
      />

      {/* Admin: Alert-Konfiguration */}
      {isAdmin && keywordId ? (
        <AlertConfigPanel
          keywordId={keywordId}
          initialThreshold={data?.alertThreshold ?? null}
          onSaved={(value) => {
            setData((prev) =>
              prev ? { ...prev, alertThreshold: value } : prev
            )
            toast({
              title: 'Alert-Schwellwert gespeichert',
              description:
                value === null
                  ? 'Keine Benachrichtigung bei Sentiment-Abfall.'
                  : `Benachrichtigung bei Score < ${value}.`,
            })
          }}
        />
      ) : null}
    </div>
  )
}

// --------------------------------------------------------------------------
// Period / Source Tabs
// --------------------------------------------------------------------------

function PeriodTabs({
  period,
  onChange,
}: {
  period: Period
  onChange: (value: Period) => void
}) {
  return (
    <Tabs
      value={period}
      onValueChange={(v) => onChange(v as Period)}
      className="w-full md:w-auto"
    >
      <TabsList aria-label="Zeitraum wählen">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((key) => (
          <TabsTrigger key={key} value={key}>
            {PERIOD_LABELS[key]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

function SourceTabs({
  source,
  onChange,
}: {
  source: SourceFilter
  onChange: (value: SourceFilter) => void
}) {
  return (
    <Tabs
      value={source}
      onValueChange={(v) => onChange(v as SourceFilter)}
      className="w-full md:w-auto"
    >
      <TabsList aria-label="Quelle filtern">
        {(Object.keys(SOURCE_LABELS) as SourceFilter[]).map((key) => (
          <TabsTrigger key={key} value={key}>
            {SOURCE_LABELS[key]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

// --------------------------------------------------------------------------
// KPI Cards
// --------------------------------------------------------------------------

function SentimentScoreCard({
  score,
  loading,
  error,
}: {
  score: number | null
  loading: boolean
  error: string | null
}) {
  const tone = getScoreTone(score)

  return (
    <Card className="rounded-2xl border-slate-100 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Sentiment-Score
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-12 w-24" />
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">
            <AlertCircle className="h-4 w-4" />
            <span>Nicht verfügbar</span>
          </div>
        ) : score === null ? (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Keine Daten
          </span>
        ) : (
          <div className="flex items-baseline gap-2">
            <span
              className={`text-4xl font-bold ${tone.textClass}`}
              aria-label={`Sentiment-Score ${score} von 100`}
            >
              {score}
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              / 100
            </span>
            <Badge
              variant="secondary"
              className={`ml-auto ${tone.badgeClass}`}
            >
              {tone.label}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SentimentDonutCard({
  distribution,
  loading,
}: {
  distribution: { positive: number; neutral: number; negative: number } | null
  loading: boolean
}) {
  const chartData = useMemo(() => {
    if (!distribution) return []
    const total =
      distribution.positive + distribution.neutral + distribution.negative
    if (total === 0) return []
    return [
      {
        name: 'Positiv',
        key: 'positive' as const,
        value: distribution.positive,
        pct: Math.round((distribution.positive / total) * 100),
      },
      {
        name: 'Neutral',
        key: 'neutral' as const,
        value: distribution.neutral,
        pct: Math.round((distribution.neutral / total) * 100),
      },
      {
        name: 'Negativ',
        key: 'negative' as const,
        value: distribution.negative,
        pct: Math.round((distribution.negative / total) * 100),
      },
    ]
  }, [distribution])

  return (
    <Card className="rounded-2xl border-slate-100 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Verteilung
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        {loading ? (
          <Skeleton className="h-[100px] w-[100px] rounded-full" />
        ) : chartData.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Keine Daten
          </p>
        ) : (
          <>
            <div className="h-[100px] w-[100px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={30}
                    outerRadius={48}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={SENTIMENT_COLORS[entry.key]}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    content={<DonutTooltip />}
                    cursor={{ fill: 'transparent' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1 text-xs">
              {chartData.map((entry) => (
                <li key={entry.key} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: SENTIMENT_COLORS[entry.key] }}
                    aria-hidden="true"
                  />
                  <span className="text-slate-700 dark:text-slate-300">
                    {entry.name}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-50">
                    {entry.pct}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

interface DonutTooltipProps {
  active?: boolean
  payload?: Array<{
    name?: string
    value?: number
    payload?: { pct?: number }
  }>
}

function DonutTooltip({ active, payload }: DonutTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0]
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="font-medium text-slate-900 dark:text-slate-100">
        {item.name}: {item.value} ({item.payload?.pct ?? 0}%)
      </div>
    </div>
  )
}

function MetaInfoCard({
  total,
  truncated,
  cachedAt,
  onRefresh,
  loading,
}: {
  total: number
  truncated: boolean
  cachedAt: string | null
  onRefresh: () => void
  loading: boolean
}) {
  return (
    <Card className="rounded-2xl border-slate-100 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Erwähnungen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-12 w-20" />
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-slate-900 dark:text-slate-50">
                {total}
              </span>
              {truncated ? (
                <Badge
                  variant="secondary"
                  className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300"
                >
                  gefiltert
                </Badge>
              ) : null}
            </div>
            {truncated ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Über 200 Mentions — Ergebnisse begrenzt.
              </p>
            ) : null}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {cachedAt
                  ? `Stand: ${formatDateTime(cachedAt)}`
                  : 'Keine Daten'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                className="h-7 gap-1.5 text-xs"
                aria-label="Mentions neu laden"
              >
                <RefreshCw className="h-3 w-3" />
                Neu laden
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// --------------------------------------------------------------------------
// Mentions List + Pagination
// --------------------------------------------------------------------------

function MentionsList({
  mentions,
  totalFiltered,
  page,
  pageCount,
  onPageChange,
  loading,
  error,
  emptyCachedAt,
  onRetry,
}: {
  mentions: Mention[]
  totalFiltered: number
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  loading: boolean
  error: string | null
  emptyCachedAt: string | null
  onRetry: () => void
}) {
  return (
    <Card className="rounded-2xl border-slate-100 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Erwähnungen
          {totalFiltered > 0 ? (
            <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
              {totalFiltered} Treffer
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ul className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-20 w-full rounded-lg" />
              </li>
            ))}
          </ul>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-6 py-8 text-center dark:border-rose-900 dark:bg-rose-950/40">
            <AlertCircle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
            <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="gap-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Erneut versuchen
            </Button>
          </div>
        ) : mentions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Newspaper className="h-6 w-6 text-slate-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Keine Erwähnungen gefunden in diesem Zeitraum
            </p>
            {emptyCachedAt ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Letzte Aktualisierung: {formatDateTime(emptyCachedAt)}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {mentions.map((m) => (
                <MentionRow key={m.id} mention={m} />
              ))}
            </ul>
            {pageCount > 1 ? (
              <SimplePagination
                page={page}
                pageCount={pageCount}
                onChange={onPageChange}
              />
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function MentionRow({ mention }: { mention: Mention }) {
  const sentimentClass =
    mention.sentiment === 'positive'
      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300'
      : mention.sentiment === 'negative'
        ? 'bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300'
        : 'bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'

  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={mention.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:text-teal-700 dark:text-slate-50 dark:hover:text-teal-400"
          >
            <span className="line-clamp-2">{mention.title}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Badge
              variant="secondary"
              className="bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
            >
              {SOURCE_LABELS[mention.source]}
            </Badge>
            <span className="truncate">{mention.sourceName}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={mention.publishedAt}>
              {formatShortDate(mention.publishedAt)}
            </time>
          </div>
        </div>
        <Badge variant="secondary" className={sentimentClass}>
          {SENTIMENT_LABELS[mention.sentiment]}
        </Badge>
      </div>
      <p className="mt-2 line-clamp-3 text-sm text-slate-600 dark:text-slate-400">
        {mention.snippet}
      </p>
    </li>
  )
}

function SimplePagination({
  page,
  pageCount,
  onChange,
}: {
  page: number
  pageCount: number
  onChange: (page: number) => void
}) {
  return (
    <nav
      aria-label="Seitennavigation"
      className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800"
    >
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Zurück
      </Button>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        Seite {page} von {pageCount}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        Weiter
      </Button>
    </nav>
  )
}

// --------------------------------------------------------------------------
// Alert Config Panel (Admin-only)
// --------------------------------------------------------------------------

function AlertConfigPanel({
  keywordId,
  initialThreshold,
  onSaved,
}: {
  keywordId: string
  initialThreshold: number | null
  onSaved: (value: number | null) => void
}) {
  const { toast } = useToast()
  const [enabled, setEnabled] = useState(initialThreshold !== null)
  const [value, setValue] = useState(
    initialThreshold !== null ? String(initialThreshold) : '40'
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEnabled(initialThreshold !== null)
    setValue(initialThreshold !== null ? String(initialThreshold) : '40')
  }, [initialThreshold])

  const handleSave = async () => {
    setError(null)
    let threshold: number | null = null
    if (enabled) {
      const num = Number(value)
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        setError('Schwellwert muss zwischen 0 und 100 liegen.')
        return
      }
      threshold = Math.round(num)
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/tenant/brand-keywords/${keywordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentiment_alert_threshold: threshold }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null
        throw new Error(body?.error ?? 'Speichern fehlgeschlagen.')
      }
      onSaved(threshold)
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="rounded-2xl border-slate-100 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-50">
          <BellRing className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          Sentiment-Alert
        </CardTitle>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Benachrichtigung auslösen, wenn der Sentiment-Score unter den
          Schwellwert fällt.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <input
            id="alert-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900"
          />
          <Label htmlFor="alert-enabled" className="text-sm">
            Alert aktivieren
          </Label>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="alert-threshold" className="text-xs">
              Schwellwert (0–100)
            </Label>
            <Input
              id="alert-threshold"
              type="number"
              min={0}
              max={100}
              step={1}
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                if (error) setError(null)
              }}
              disabled={!enabled || saving}
              aria-invalid={error !== null}
              aria-describedby={error ? 'alert-threshold-error' : undefined}
            />
            {error ? (
              <p
                id="alert-threshold-error"
                className="mt-1 text-xs text-rose-600 dark:text-rose-400"
              >
                {error}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="dark"
            onClick={handleSave}
            disabled={saving}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Speichere…' : 'Speichern'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function getScoreTone(score: number | null): {
  label: string
  badgeClass: string
  textClass: string
} {
  if (score === null) {
    return {
      label: '—',
      badgeClass:
        'bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
      textClass: 'text-slate-900 dark:text-slate-50',
    }
  }
  if (score >= 70) {
    return {
      label: 'Positiv',
      badgeClass:
        'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    }
  }
  if (score >= 40) {
    return {
      label: 'Neutral',
      badgeClass:
        'bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
      textClass: 'text-slate-900 dark:text-slate-50',
    }
  }
  return {
    label: 'Kritisch',
    badgeClass:
      'bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300',
    textClass: 'text-rose-700 dark:text-rose-400',
  }
}

function formatShortDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
