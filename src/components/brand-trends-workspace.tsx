'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { InlineConfirm } from '@/components/inline-confirm'
import { NoCustomerSelected } from '@/components/no-customer-selected'
import { BrandMentionsPanel } from '@/components/brand-mentions-panel'
import { SocialTrendsPanel } from '@/components/social-trends-panel'
import { useActiveCustomer } from '@/lib/active-customer-context'
import { useToast } from '@/hooks/use-toast'

type WorkspaceTab = 'trends' | 'mentions' | 'social'

export interface BrandTrendsWorkspaceProps {
  isAdmin?: boolean
}

type Period = '7d' | '30d' | '90d'

interface BrandKeyword {
  id: string
  keyword: string
  isPrimary: boolean
  createdAt: string
}

interface TrendPoint {
  date: string
  value: number
}

interface RelatedItem {
  label: string
  type: 'rising' | 'top'
  value?: number
}

interface TrendResponse {
  timeline: TrendPoint[]
  relatedQueries: RelatedItem[]
  relatedTopics: RelatedItem[]
  cachedAt: string | null
  stale?: boolean
}

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 Tage',
  '30d': '30 Tage',
  '90d': '90 Tage',
}

const KEYWORD_MIN_LENGTH = 2
const KEYWORD_MAX_COUNT = 5

function validateKeyword(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length < KEYWORD_MIN_LENGTH) {
    return `Keyword muss mindestens ${KEYWORD_MIN_LENGTH} Zeichen haben.`
  }
  if (trimmed.length > 60) {
    return 'Keyword darf maximal 60 Zeichen haben.'
  }
  if (!/^[\p{L}\p{N}\s&.\-']+$/u.test(trimmed)) {
    return 'Keyword enthält ungültige Sonderzeichen.'
  }
  return null
}

export function BrandTrendsWorkspace({
  isAdmin = false,
}: BrandTrendsWorkspaceProps = {}) {
  const { activeCustomer } = useActiveCustomer()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('trends')

  const [keywords, setKeywords] = useState<BrandKeyword[]>([])
  const [keywordsLoading, setKeywordsLoading] = useState(false)
  const [keywordsError, setKeywordsError] = useState<string | null>(null)

  const [newKeyword, setNewKeyword] = useState('')
  const [adding, setAdding] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const [period, setPeriod] = useState<Period>('30d')

  const [trendData, setTrendData] = useState<TrendResponse | null>(null)
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendError, setTrendError] = useState<string | null>(null)

  const primaryKeyword = useMemo(
    () => keywords.find((k) => k.isPrimary) ?? keywords[0] ?? null,
    [keywords]
  )

  // Load keywords when customer changes
  const loadKeywords = useCallback(
    async (customerId: string) => {
      setKeywordsLoading(true)
      setKeywordsError(null)
      try {
        const res = await fetch(
          `/api/tenant/brand-keywords?customer_id=${encodeURIComponent(customerId)}`,
          { cache: 'no-store' }
        )
        if (!res.ok) {
          throw new Error('Keywords konnten nicht geladen werden.')
        }
        const data = (await res.json()) as { keywords: BrandKeyword[] }
        setKeywords(data.keywords ?? [])
      } catch (err) {
        setKeywordsError(err instanceof Error ? err.message : 'Unbekannter Fehler.')
        setKeywords([])
      } finally {
        setKeywordsLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (!activeCustomer) {
      setKeywords([])
      setTrendData(null)
      return
    }
    loadKeywords(activeCustomer.id)
  }, [activeCustomer, loadKeywords])

  // Load trend data whenever primary keyword or period changes
  const loadTrend = useCallback(
    async (customerId: string, keyword: string, periodValue: Period) => {
      setTrendLoading(true)
      setTrendError(null)
      try {
        const params = new URLSearchParams({
          customer_id: customerId,
          keyword,
          period: periodValue,
        })
        const res = await fetch(`/api/tenant/brand-trends?${params.toString()}`, {
          cache: 'no-store',
        })
        if (res.status === 429) {
          throw new Error(
            'API-Limit erreicht – kein Cache verfügbar. Bitte in einigen Stunden erneut versuchen.'
          )
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? 'Trend-Daten konnten nicht geladen werden.')
        }
        const data = (await res.json()) as TrendResponse
        setTrendData(data)
      } catch (err) {
        setTrendError(err instanceof Error ? err.message : 'Unbekannter Fehler.')
        setTrendData(null)
      } finally {
        setTrendLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (!activeCustomer || !primaryKeyword) {
      setTrendData(null)
      return
    }
    loadTrend(activeCustomer.id, primaryKeyword.keyword, period)
  }, [activeCustomer, primaryKeyword, period, loadTrend])

  // Add keyword handler
  const handleAddKeyword = async () => {
    if (!activeCustomer) return
    const error = validateKeyword(newKeyword)
    if (error) {
      setValidationError(error)
      return
    }
    if (keywords.length >= KEYWORD_MAX_COUNT) {
      setValidationError(`Maximal ${KEYWORD_MAX_COUNT} Keywords pro Kunde erlaubt.`)
      return
    }
    setValidationError(null)
    setAdding(true)
    try {
      const res = await fetch('/api/tenant/brand-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: activeCustomer.id,
          keyword: newKeyword.trim(),
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Keyword konnte nicht gespeichert werden.')
      }
      const data = (await res.json()) as { keyword: BrandKeyword }
      setKeywords((prev) => [...prev, data.keyword])
      setNewKeyword('')
      toast({
        title: 'Keyword hinzugefügt',
        description: `„${data.keyword.keyword}" wird jetzt getrackt.`,
      })
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler.',
        variant: 'destructive',
      })
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteKeyword = async (id: string) => {
    try {
      const res = await fetch(`/api/tenant/brand-keywords/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Löschen fehlgeschlagen.')
      }
      setKeywords((prev) => prev.filter((k) => k.id !== id))
      toast({ title: 'Keyword entfernt' })
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler.',
        variant: 'destructive',
      })
    }
  }

  const handleSetPrimary = async (id: string) => {
    try {
      const res = await fetch(`/api/tenant/brand-keywords/${id}/primary`, {
        method: 'PATCH',
      })
      if (!res.ok) {
        throw new Error('Primär-Status konnte nicht gesetzt werden.')
      }
      setKeywords((prev) =>
        prev.map((k) => ({ ...k, isPrimary: k.id === id }))
      )
      toast({ title: 'Primäres Keyword geändert' })
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler.',
        variant: 'destructive',
      })
    }
  }

  if (!activeCustomer) {
    return <NoCustomerSelected toolName="Brand Trends" />
  }

  return (
    <div className="flex flex-col gap-6">
      <KeywordsManager
        keywords={keywords}
        loading={keywordsLoading}
        error={keywordsError}
        newKeyword={newKeyword}
        onNewKeywordChange={(value) => {
          setNewKeyword(value)
          if (validationError) setValidationError(null)
        }}
        onAdd={handleAddKeyword}
        adding={adding}
        validationError={validationError}
        onDelete={handleDeleteKeyword}
        onSetPrimary={handleSetPrimary}
        onRetry={() => loadKeywords(activeCustomer.id)}
      />

      {keywords.length === 0 && !keywordsLoading && !keywordsError ? (
        <EmptyKeywordsState />
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as WorkspaceTab)}
          className="w-full"
        >
          <TabsList aria-label="Brand-Intelligence-Bereiche">
            <TabsTrigger value="trends">Trend-Verlauf</TabsTrigger>
            <TabsTrigger value="mentions">Mentions &amp; Sentiment</TabsTrigger>
            <TabsTrigger value="social">Social Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="trends" className="mt-6 flex flex-col gap-6">
            <PeriodTabs period={period} onChange={setPeriod} />

            <TrendChartCard
              keyword={primaryKeyword?.keyword ?? null}
              period={period}
              loading={trendLoading}
              error={trendError}
              data={trendData}
              onRetry={() => {
                if (activeCustomer && primaryKeyword) {
                  loadTrend(activeCustomer.id, primaryKeyword.keyword, period)
                }
              }}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <RelatedPanel
                title="Verwandte Suchanfragen"
                items={trendData?.relatedQueries ?? []}
                loading={trendLoading}
                emptyText="Keine verwandten Suchanfragen gefunden."
              />
              <RelatedPanel
                title="Verwandte Themen"
                items={trendData?.relatedTopics ?? []}
                loading={trendLoading}
                emptyText="Keine verwandten Themen gefunden."
              />
            </div>
          </TabsContent>

          <TabsContent value="mentions" className="mt-6">
            <BrandMentionsPanel
              customerId={activeCustomer.id}
              keyword={primaryKeyword?.keyword ?? null}
              keywordId={primaryKeyword?.id ?? null}
              isAdmin={isAdmin}
            />
          </TabsContent>

          <TabsContent value="social" className="mt-6">
            <SocialTrendsPanel
              customerId={activeCustomer.id}
              customerName={activeCustomer.name}
              initialCategory={null}
              isAdmin={isAdmin}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------
// Keywords Manager
// --------------------------------------------------------------------------

interface KeywordsManagerProps {
  keywords: BrandKeyword[]
  loading: boolean
  error: string | null
  newKeyword: string
  onNewKeywordChange: (value: string) => void
  onAdd: () => void
  adding: boolean
  validationError: string | null
  onDelete: (id: string) => void
  onSetPrimary: (id: string) => void
  onRetry?: () => void
}

function KeywordsManager({
  keywords,
  loading,
  error,
  newKeyword,
  onNewKeywordChange,
  onAdd,
  adding,
  validationError,
  onDelete,
  onSetPrimary,
  onRetry,
}: KeywordsManagerProps) {
  const canAdd = keywords.length < KEYWORD_MAX_COUNT

  return (
    <Card className="rounded-2xl border-slate-100 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Brand-Keywords
          <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
            {keywords.length} / {KEYWORD_MAX_COUNT}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
        ) : error ? (
          <div className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 dark:border-rose-900 dark:bg-rose-950/40">
            <div className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            {onRetry ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="w-fit gap-2 self-start"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Erneut versuchen
              </Button>
            ) : null}
          </div>
        ) : keywords.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Noch keine Keywords hinterlegt. Füge unten das erste Brand-Keyword hinzu.
          </p>
        ) : (
          <TooltipProvider delayDuration={150}>
            <ul className="flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <li
                  key={keyword.id}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                >
                  <span className="font-medium">{keyword.keyword}</span>
                  {keyword.isPrimary ? (
                    <Badge
                      variant="secondary"
                      className="ml-1 gap-1 bg-teal-100 text-[10px] text-teal-800 hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-300"
                    >
                      <Star className="h-2.5 w-2.5 fill-current" />
                      Primär
                    </Badge>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onSetPrimary(keyword.id)}
                          className="ml-1 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          aria-label={`„${keyword.keyword}" als primär setzen`}
                        >
                          <Star className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Als primär setzen</TooltipContent>
                    </Tooltip>
                  )}
                  <InlineConfirm
                    message={`„${keyword.keyword}" entfernen?`}
                    onConfirm={() => onDelete(keyword.id)}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="ml-1 rounded-full p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          aria-label={`„${keyword.keyword}" löschen`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Keyword löschen</TooltipContent>
                    </Tooltip>
                  </InlineConfirm>
                </li>
              ))}
            </ul>
          </TooltipProvider>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex-1">
            <Input
              value={newKeyword}
              onChange={(e) => onNewKeywordChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canAdd && !adding) {
                  e.preventDefault()
                  onAdd()
                }
              }}
              id="brand-keyword-input"
              placeholder={
                canAdd ? 'Neues Brand-Keyword eingeben…' : 'Limit erreicht'
              }
              disabled={!canAdd || adding}
              aria-invalid={validationError !== null}
              aria-describedby={validationError ? 'keyword-error' : undefined}
            />
            {validationError ? (
              <p
                id="keyword-error"
                className="mt-1 text-xs text-rose-600 dark:text-rose-400"
              >
                {validationError}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="dark"
            onClick={onAdd}
            disabled={!canAdd || adding || newKeyword.trim().length === 0}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Hinzufügen
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// --------------------------------------------------------------------------
// Period Tabs
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
      onValueChange={(value) => onChange(value as Period)}
      className="w-full sm:w-auto"
    >
      <TabsList>
        {(Object.keys(PERIOD_LABELS) as Period[]).map((key) => (
          <TabsTrigger key={key} value={key}>
            {PERIOD_LABELS[key]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

// --------------------------------------------------------------------------
// Trend Chart
// --------------------------------------------------------------------------

interface TrendChartCardProps {
  keyword: string | null
  period: Period
  loading: boolean
  error: string | null
  data: TrendResponse | null
  onRetry: () => void
}

function TrendChartCard({
  keyword,
  period,
  loading,
  error,
  data,
  onRetry,
}: TrendChartCardProps) {
  const hasData = data && data.timeline.length > 0
  const timeline = data?.timeline ?? []

  return (
    <Card className="rounded-2xl border-slate-100 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
      <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-50">
            <TrendingUp className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Trend-Verlauf
            {keyword ? (
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400 break-all">
                · „{keyword}&#34;
              </span>
            ) : null}
          </CardTitle>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Google-Trends-Index (0–100) · {PERIOD_LABELS[period]}
          </p>
        </div>
        {data?.cachedAt ? (
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            {data.stale ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertCircle className="h-3 w-3" />
                Cache-Daten
              </span>
            ) : null}
            <span>Stand: {formatDateTime(data.cachedAt)}</span>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-[260px] w-full rounded-lg" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-6 py-8 text-center dark:border-rose-900 dark:bg-rose-950/40">
            <AlertCircle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
            <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
            <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              Erneut versuchen
            </Button>
          </div>
        ) : !hasData ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Zu wenig Suchvolumen für diesen Zeitraum
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Google Trends hat keine aussagekräftigen Werte für „{keyword}&#34; geliefert.
            </p>
          </div>
        ) : (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => formatShortDate(value)}
                  tick={{ fontSize: 11 }}
                  className="fill-slate-500 dark:fill-slate-400"
                  stroke="currentColor"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  className="fill-slate-500 dark:fill-slate-400"
                  stroke="currentColor"
                />
                <RechartsTooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: 'rgb(20, 184, 166)', strokeWidth: 1 }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="rgb(13, 148, 136)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: 'rgb(13, 148, 136)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: TrendPoint }>
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="font-medium text-slate-900 dark:text-slate-100">
        {formatLongDate(point.date)}
      </div>
      <div className="mt-0.5 text-teal-600 dark:text-teal-400">
        Index: <span className="font-semibold">{point.value}</span>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Related Panels
// --------------------------------------------------------------------------

function RelatedPanel({
  title,
  items,
  loading,
  emptyText,
}: {
  title: string
  items: RelatedItem[]
  loading: boolean
  emptyText: string
}) {
  return (
    <Card className="rounded-2xl border-slate-100 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-50">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ul className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <li key={index}>
                <Skeleton className="h-8 w-full rounded-md" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{emptyText}</p>
        ) : (
          <ul className="space-y-2">
            {items.slice(0, 5).map((item, index) => (
              <li
                key={`${item.label}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60"
              >
                <span className="truncate text-slate-800 dark:text-slate-200">
                  {item.label}
                </span>
                <Badge
                  variant="secondary"
                  className={
                    item.type === 'rising'
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }
                >
                  {item.type === 'rising' ? 'Rising' : 'Top'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// --------------------------------------------------------------------------
// Empty state when no keywords
// --------------------------------------------------------------------------

function EmptyKeywordsState() {
  const focusInput = () => {
    const input = document.getElementById('brand-keyword-input') as HTMLInputElement | null
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    input?.focus()
  }

  return (
    <Card className="rounded-2xl border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 dark:bg-teal-950/40">
          <TrendingUp className="h-5 w-5 text-teal-600 dark:text-teal-400" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Noch keine Brand-Keywords
          </h3>
          <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Füge das erste Keyword hinzu, um den Google-Trends-Verlauf für diesen
            Kunden zu sehen.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={focusInput}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Jetzt Keyword hinzufügen
        </Button>
      </CardContent>
    </Card>
  )
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function formatShortDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function formatLongDate(value: string): string {
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
