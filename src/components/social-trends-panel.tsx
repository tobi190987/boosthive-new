'use client'

/**
 * PROJ-68: Social Media Trend Radar
 *
 * Zeigt trending Hashtags, virale Content-Beispiele und Verlaufs-Sparklines
 * pro Plattform (TikTok / Instagram / YouTube) für die Branche/Kategorie
 * des aktiven Kunden.
 *
 * Backend-Endpoints (folgen via /backend):
 *   GET   /api/tenant/social-trends?customer_id=…&platform=…&period=today|week|month
 *   GET   /api/tenant/social-trends/export?customer_id=…&platform=…&period=…
 *   PATCH /api/tenant/customers/[id]/industry-category  — body: { industry_category: string | null }
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  AlertCircle,
  Download,
  ExternalLink,
  Hash,
  Info,
  Layers,
  Minus,
  RefreshCw,
  Save,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Line, LineChart, ResponsiveContainer } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Platform = 'tiktok' | 'instagram' | 'youtube'
type Period = 'today' | 'week' | 'month'
type Direction = 'rising' | 'stable' | 'falling'

interface TrendContentExample {
  id: string
  title: string
  url: string
  thumbnailUrl: string | null
  author?: string | null
  views?: number | null
}

interface SparklinePoint {
  date: string
  value: number
}

interface HashtagTrend {
  hashtag: string
  volume: number | null
  direction: Direction
  sparkline: SparklinePoint[]
  examples: TrendContentExample[]
}

interface SocialTrendsResponse {
  platform: Platform
  period: Period
  category: string | null
  hashtags: HashtagTrend[]
  cachedAt: string | null
  /** true, wenn Daten aus abgelaufenem Cache stammen (API-Limit/Ausfall) */
  stale?: boolean
  /** true, wenn Plattform-API aktuell nicht verfügbar ist */
  unavailable?: boolean
  /** Hinweistext, warum Plattform nicht verfügbar ist */
  unavailableReason?: string | null
}

interface PlatformAvailability {
  tiktok: boolean
  instagram: boolean
  youtube: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
}

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Heute',
  week: 'Diese Woche',
  month: 'Dieser Monat',
}

const DIRECTION_LABELS: Record<Direction, string> = {
  rising: 'Steigend',
  stable: 'Stabil',
  falling: 'Fallend',
}

const INDUSTRY_SUGGESTIONS = [
  'Fitness',
  'Beauty',
  'Food',
  'Fashion',
  'Reise',
  'Lifestyle',
  'Technik',
  'Gaming',
  'Finanzen',
  'Immobilien',
  'Gesundheit',
  'Automobil',
  'Bildung',
  'Handwerk',
  'B2B-Services',
]

const DEFAULT_AVAILABILITY: PlatformAvailability = {
  tiktok: true,
  instagram: true,
  youtube: true,
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SocialTrendsPanelProps {
  customerId: string
  customerName: string
  initialCategory: string | null
  isAdmin: boolean
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SocialTrendsPanel({
  customerId,
  customerName,
  initialCategory,
  isAdmin,
}: SocialTrendsPanelProps) {
  const { toast } = useToast()

  const [category, setCategory] = useState<string | null>(initialCategory)
  const [categoryLoading, setCategoryLoading] = useState(initialCategory === null)
  const [platform, setPlatform] = useState<Platform>('tiktok')
  const [period, setPeriod] = useState<Period>('week')

  // Initiale Kategorie laden, falls nicht als Prop übergeben.
  useEffect(() => {
    if (initialCategory !== null) {
      setCategory(initialCategory)
      setCategoryLoading(false)
      return
    }
    const controller = new AbortController()
    const load = async () => {
      try {
        const res = await fetch(
          `/api/tenant/customers/${customerId}/industry-category`,
          { cache: 'no-store', signal: controller.signal }
        )
        if (!res.ok) throw new Error()
        const body = (await res.json()) as { industry_category: string | null }
        setCategory(body.industry_category ?? null)
      } catch {
        // still null – User sieht Editor
      } finally {
        setCategoryLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [customerId, initialCategory])

  const [data, setData] = useState<SocialTrendsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [availability, setAvailability] = useState<PlatformAvailability>(
    DEFAULT_AVAILABILITY
  )
  const [exporting, setExporting] = useState(false)

  const loadTrends = useCallback(
    async (signal?: AbortSignal) => {
      if (!category) return
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          customer_id: customerId,
          platform,
          period,
        })
        const res = await fetch(
          `/api/tenant/social-trends?${params.toString()}`,
          { cache: 'no-store', signal }
        )
        if (res.status === 429) {
          throw new Error(
            'API-Limit erreicht. Bitte in einigen Stunden erneut versuchen.'
          )
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null
          throw new Error(
            body?.error ?? 'Trend-Daten konnten nicht geladen werden.'
          )
        }
        const payload = (await res.json()) as SocialTrendsResponse & {
          availability?: PlatformAvailability
        }
        setData(payload)
        if (payload.availability) {
          setAvailability(payload.availability)
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler.')
        setData(null)
      } finally {
        setLoading(false)
      }
    },
    [customerId, platform, period, category]
  )

  useEffect(() => {
    const controller = new AbortController()
    loadTrends(controller.signal)
    return () => controller.abort()
  }, [loadTrends])

  // Auto-fallback: wenn aktuelle Plattform nicht verfügbar, wechsle auf die erste verfügbare.
  useEffect(() => {
    if (!availability[platform]) {
      const firstAvailable = (Object.keys(availability) as Platform[]).find(
        (key) => availability[key]
      )
      if (firstAvailable) setPlatform(firstAvailable)
    }
  }, [availability, platform])

  const handleCategorySaved = useCallback((value: string | null) => {
    setCategory(value)
  }, [])

  const handleExport = async () => {
    if (!category) return
    setExporting(true)
    try {
      const params = new URLSearchParams({
        customer_id: customerId,
        platform,
        period,
      })
      const res = await fetch(
        `/api/tenant/social-trends/export?${params.toString()}`,
        { cache: 'no-store' }
      )
      if (!res.ok) {
        throw new Error('Export konnte nicht erstellt werden.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `social-trends_${customerName}_${platform}_${period}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: 'CSV exportiert' })
    } catch (err) {
      toast({
        title: 'Export fehlgeschlagen',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler.',
        variant: 'destructive',
      })
    } finally {
      setExporting(false)
    }
  }

  const hasHashtags = (data?.hashtags.length ?? 0) > 0
  const platformAllAvailable = Object.values(availability).some((v) => v)

  return (
    <div className="flex flex-col gap-6">
      {/* Branchen-/Kategorie-Pflege */}
      <IndustryCategoryEditor
        customerId={customerId}
        initialCategory={category}
        onSaved={handleCategorySaved}
        disabled={!isAdmin && category !== null}
      />

      {categoryLoading ? (
        <Skeleton className="h-[220px] w-full rounded-2xl" />
      ) : !category ? (
        <CategoryMissingState />
      ) : !platformAllAvailable ? (
        <AllPlatformsUnavailableState />
      ) : (
        <>
          {/* Filterzeile */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <PlatformTabs
              platform={platform}
              onChange={setPlatform}
              availability={availability}
            />
            <div className="flex flex-wrap items-center gap-3">
              <PeriodTabs period={period} onChange={setPeriod} />
              <Tooltip>
                <TooltipProvider delayDuration={150}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleExport}
                      disabled={!hasHashtags || exporting}
                      className="gap-2"
                      aria-label="Hashtags als CSV exportieren"
                    >
                      <Download className="h-3.5 w-3.5" />
                      CSV-Export
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Trending-Hashtags als CSV herunterladen
                  </TooltipContent>
                </TooltipProvider>
              </Tooltip>
            </div>
          </div>

          {/* Stale-Daten-Hinweis */}
          {data?.stale ? (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Daten aus dem Cache (Stand:{' '}
                {data.cachedAt ? formatDateTime(data.cachedAt) : '?'}) — API war
                nicht erreichbar.
              </span>
            </div>
          ) : null}

          {/* Plattform nicht verfügbar */}
          {data?.unavailable ? (
            <PlatformUnavailableState
              platform={platform}
              reason={data.unavailableReason ?? null}
            />
          ) : (
            <HashtagTrendList
              hashtags={data?.hashtags ?? []}
              platform={platform}
              loading={loading}
              error={error}
              onRetry={() => loadTrends()}
              cachedAt={data?.cachedAt ?? null}
            />
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Industry Category Editor
// ---------------------------------------------------------------------------

interface IndustryCategoryEditorProps {
  customerId: string
  initialCategory: string | null
  onSaved: (value: string | null) => void
  disabled?: boolean
}

function IndustryCategoryEditor({
  customerId,
  initialCategory,
  onSaved,
  disabled,
}: IndustryCategoryEditorProps) {
  const { toast } = useToast()
  const [value, setValue] = useState<string>(initialCategory ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = (initialCategory ?? '') !== value.trim()

  useEffect(() => {
    setValue(initialCategory ?? '')
  }, [initialCategory])

  const handleSave = async () => {
    setSaving(true)
    try {
      const trimmed = value.trim()
      const res = await fetch(
        `/api/tenant/customers/${customerId}/industry-category`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            industry_category: trimmed.length === 0 ? null : trimmed,
          }),
        }
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null
        throw new Error(body?.error ?? 'Branche konnte nicht gespeichert werden.')
      }
      onSaved(trimmed.length === 0 ? null : trimmed)
      toast({
        title: 'Branche gespeichert',
        description:
          trimmed.length === 0
            ? 'Branche wurde entfernt.'
            : `Trends werden nun für „${trimmed}" abgerufen.`,
      })
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
          <Layers className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          Branche / Kategorie
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label
              htmlFor="industry-category-input"
              className="text-xs text-slate-600 dark:text-slate-300"
            >
              Branche (Freitext oder Vorschlag wählen)
            </Label>
            <Input
              id="industry-category-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="z. B. Fitness, Beauty, Food…"
              disabled={disabled || saving}
              maxLength={60}
            />
          </div>
          <div className="w-full sm:w-56">
            <Label
              htmlFor="industry-category-select"
              className="text-xs text-slate-600 dark:text-slate-300"
            >
              Vorschlag übernehmen
            </Label>
            <Select
              onValueChange={(val) => setValue(val)}
              disabled={disabled || saving}
            >
              <SelectTrigger id="industry-category-select">
                <SelectValue placeholder="Kategorie wählen" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRY_SUGGESTIONS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="dark"
            onClick={handleSave}
            disabled={disabled || saving || !dirty}
            className="gap-2 sm:w-auto"
          >
            <Save className="h-4 w-4" />
            Speichern
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Platform & Period Tabs
// ---------------------------------------------------------------------------

function PlatformTabs({
  platform,
  onChange,
  availability,
}: {
  platform: Platform
  onChange: (value: Platform) => void
  availability: PlatformAvailability
}) {
  return (
    <Tabs
      value={platform}
      onValueChange={(value) => onChange(value as Platform)}
      className="w-full sm:w-auto"
    >
      <TabsList aria-label="Plattformen">
        {(Object.keys(PLATFORM_LABELS) as Platform[]).map((key) => {
          const available = availability[key]
          const trigger = (
            <TabsTrigger
              key={key}
              value={key}
              disabled={!available}
              aria-label={`${PLATFORM_LABELS[key]}${available ? '' : ' – API nicht verfügbar'}`}
            >
              {PLATFORM_LABELS[key]}
            </TabsTrigger>
          )
          if (available) return trigger
          return (
            <TooltipProvider key={key} delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">{trigger}</span>
                </TooltipTrigger>
                <TooltipContent>API momentan nicht verfügbar</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        })}
      </TabsList>
    </Tabs>
  )
}

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
      <TabsList aria-label="Zeitraum">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((key) => (
          <TabsTrigger key={key} value={key}>
            {PERIOD_LABELS[key]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

// ---------------------------------------------------------------------------
// Hashtag-Trend-Liste
// ---------------------------------------------------------------------------

interface HashtagTrendListProps {
  hashtags: HashtagTrend[]
  platform: Platform
  loading: boolean
  error: string | null
  onRetry: () => void
  cachedAt: string | null
}

function HashtagTrendList({
  hashtags,
  platform,
  loading,
  error,
  onRetry,
  cachedAt,
}: HashtagTrendListProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[220px] w-full rounded-2xl" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-10 text-center dark:border-rose-900 dark:bg-rose-950/40">
        <AlertCircle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
        <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Erneut versuchen
        </Button>
      </div>
    )
  }

  if (hashtags.length === 0) {
    return <NoTrendsState />
  }

  return (
    <div className="flex flex-col gap-3">
      {cachedAt ? (
        <p className="text-right text-[11px] text-slate-500 dark:text-slate-400">
          Stand: {formatDateTime(cachedAt)}
        </p>
      ) : null}
      <ul className="grid gap-4 md:grid-cols-2">
        {hashtags.map((item) => (
          <li key={`${platform}-${item.hashtag}`}>
            <HashtagCard hashtag={item} platform={platform} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function HashtagCard({
  hashtag,
  platform,
}: {
  hashtag: HashtagTrend
  platform: Platform
}) {
  return (
    <Card className="flex h-full flex-col rounded-2xl border-slate-100 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-50">
              <Hash className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span className="truncate">{hashtag.hashtag}</span>
            </CardTitle>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {PLATFORM_LABELS[platform]}
              {hashtag.volume !== null ? (
                <> · {formatVolume(hashtag.volume)} Posts</>
              ) : null}
            </p>
          </div>
          <DirectionBadge direction={hashtag.direction} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <Sparkline data={hashtag.sparkline} direction={hashtag.direction} />
        {hashtag.examples.length > 0 ? (
          <TrendingContentExamples examples={hashtag.examples} />
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Keine Beispiel-Posts verfügbar.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function DirectionBadge({ direction }: { direction: Direction }) {
  const label = DIRECTION_LABELS[direction]
  const Icon =
    direction === 'rising'
      ? TrendingUp
      : direction === 'falling'
        ? TrendingDown
        : Minus
  const className =
    direction === 'rising'
      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300'
      : direction === 'falling'
        ? 'bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300'
        : 'bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
  return (
    <Badge variant="secondary" className={`gap-1 shrink-0 ${className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  )
}

function Sparkline({
  data,
  direction,
}: {
  data: SparklinePoint[]
  direction: Direction
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-16 items-center justify-center text-xs text-slate-400 dark:text-slate-500">
        Kein Verlauf vorhanden
      </div>
    )
  }
  const color =
    direction === 'rising'
      ? 'rgb(16, 185, 129)'
      : direction === 'falling'
        ? 'rgb(244, 63, 94)'
        : 'rgb(148, 163, 184)'
  return (
    <div className="h-16 w-full" aria-label="Verlauf der letzten 14 Tage">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function TrendingContentExamples({
  examples,
}: {
  examples: TrendContentExample[]
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Virale Beispiele
      </p>
      <ul className="space-y-2">
        {examples.slice(0, 5).map((ex) => (
          <li key={ex.id}>
            <Link
              href={ex.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-2 hover:border-teal-200 hover:bg-teal-50/40 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-teal-900 dark:hover:bg-teal-950/20"
            >
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-slate-200 dark:bg-slate-800">
                {ex.thumbnailUrl ? (
                  <Image
                    src={ex.thumbnailUrl}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                    <Sparkles className="h-4 w-4" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-xs font-medium text-slate-800 dark:text-slate-200">
                  {ex.title}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {ex.author ? `${ex.author} · ` : ''}
                  {ex.views != null ? `${formatVolume(ex.views)} Views` : ''}
                </p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty / Error States
// ---------------------------------------------------------------------------

function CategoryMissingState() {
  return (
    <Card className="rounded-2xl border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40">
      <CardContent className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <Layers className="h-6 w-6 text-slate-400" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Noch keine Branche hinterlegt
        </p>
        <p className="max-w-md text-xs text-slate-500 dark:text-slate-400">
          Setze oben eine Branche oder Kategorie, um plattformspezifische
          Hashtag-Trends und virale Content-Beispiele zu sehen.
        </p>
      </CardContent>
    </Card>
  )
}

function NoTrendsState() {
  return (
    <Card className="rounded-2xl border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <Info className="h-6 w-6 text-slate-400" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Keine Trends für diese Branche gefunden
        </p>
        <p className="max-w-md text-xs text-slate-500 dark:text-slate-400">
          Deine Kategorie ist eventuell zu spezifisch. Versuche eine breitere
          Kategorie wie z. B.:
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {INDUSTRY_SUGGESTIONS.slice(0, 6).map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className="bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              {item}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function PlatformUnavailableState({
  platform,
  reason,
}: {
  platform: Platform
  reason: string | null
}) {
  return (
    <Card className="rounded-2xl border-dashed border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
      <CardContent className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          {PLATFORM_LABELS[platform]}-API momentan nicht verfügbar
        </p>
        <p className="max-w-md text-xs text-amber-700 dark:text-amber-300">
          {reason ??
            'Die Plattform-API liefert aktuell keine Daten. Bitte später erneut versuchen oder eine andere Plattform wählen.'}
        </p>
      </CardContent>
    </Card>
  )
}

function AllPlatformsUnavailableState() {
  return (
    <Card className="rounded-2xl border-dashed border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
      <CardContent className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          Social-Trend-APIs nicht erreichbar
        </p>
        <p className="max-w-md text-xs text-amber-700 dark:text-amber-300">
          Aktuell sind keine Plattformen verfügbar. Die Daten werden automatisch
          nachgeladen, sobald die Schnittstellen wieder erreichbar sind.
        </p>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function formatVolume(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} Mrd.`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mio.`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return value.toLocaleString('de-DE')
}
