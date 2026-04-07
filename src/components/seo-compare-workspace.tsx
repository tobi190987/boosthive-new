'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  GitCompare,
  Loader2,
  MinusCircle,
  Plus,
  Trash2,
  Trophy,
  X,
  XCircle,
} from 'lucide-react'
import type { SeoPageResult } from '@/lib/seo-analysis'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useActiveCustomer } from '@/lib/active-customer-context'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComparisonResult {
  id: string
  createdAt: string
  ownUrl: string
  competitorUrls: string[]
  results: SeoPageResult[]
}

interface ComparisonSummary {
  id: string
  ownUrl: string
  competitorUrls: string[]
  createdAt: string
}

type CompareView = { type: 'list' } | { type: 'running' } | { type: 'results'; data: ComparisonResult }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(value: string) {
  return new Date(value).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function extractHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

type MetricRank = 'best' | 'middle' | 'worst' | 'tied-best' | 'error'

function rankValues(values: number[], lowerIsBetter = false): MetricRank[] {
  const max = Math.max(...values)
  const min = Math.min(...values)
  return values.map((v) => {
    if (lowerIsBetter) {
      if (v === min && v === max) return 'tied-best'
      if (v === min) return 'best'
      if (v === max) return 'worst'
      return 'middle'
    } else {
      if (v === max && v === min) return 'tied-best'
      if (v === max) return 'best'
      if (v === min) return 'worst'
      return 'middle'
    }
  })
}

function rankBooleans(values: boolean[]): MetricRank[] {
  const trueCount = values.filter(Boolean).length
  return values.map((v) => {
    if (trueCount === values.length) return 'tied-best'
    if (trueCount === 0) return 'tied-best'
    return v ? 'best' : 'worst'
  })
}

function rankBadge(rank: MetricRank) {
  if (rank === 'best') return 'bg-emerald-50 border-emerald-200 text-emerald-700'
  if (rank === 'tied-best') return 'bg-slate-50 dark:bg-secondary border-slate-200 dark:border-border text-slate-600 dark:text-slate-300'
  if (rank === 'middle') return 'bg-amber-50 border-amber-200 text-amber-700'
  if (rank === 'worst') return 'bg-red-50 border-red-200 text-red-700'
  return 'bg-slate-50 dark:bg-secondary border-slate-200 dark:border-border text-slate-500'
}

function RankIcon({ rank }: { rank: MetricRank }) {
  if (rank === 'best') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
  if (rank === 'worst') return <XCircle className="h-3.5 w-3.5 text-red-500" />
  if (rank === 'middle') return <MinusCircle className="h-3.5 w-3.5 text-amber-500" />
  return null
}

// ---------------------------------------------------------------------------
// Gap Analysis
// ---------------------------------------------------------------------------

interface GapItem {
  label: string
  ownValue: string
  bestValue: string
  recommendation: string
}

function computeGapAnalysis(ownResult: SeoPageResult, competitors: SeoPageResult[]): GapItem[] {
  const reachableCompetitors = competitors.filter((c) => !c.error)
  if (reachableCompetitors.length === 0) return []

  const gaps: GapItem[] = []

  // Score gap
  const bestScore = Math.max(...reachableCompetitors.map((c) => c.score))
  if (ownResult.score < bestScore - 5) {
    gaps.push({
      label: 'Gesamt-Score',
      ownValue: `${ownResult.score}/100`,
      bestValue: `${bestScore}/100`,
      recommendation: 'Behebe die kritischen SEO-Probleme auf deiner Seite (fehlende Meta-Tags, Alt-Texte, Canonical etc.) um deinen Score zu verbessern.',
    })
  }

  // Title length
  const ownTitleLen = ownResult.title.length
  const bestTitleLen = reachableCompetitors
    .map((c) => c.title.length)
    .filter((len) => len >= 30 && len <= 60)
  if (bestTitleLen.length > 0 && (ownTitleLen < 30 || ownTitleLen > 60)) {
    gaps.push({
      label: 'Title-Tag Länge',
      ownValue: ownTitleLen === 0 ? 'Fehlend' : `${ownTitleLen} Zeichen`,
      bestValue: `${bestTitleLen[0]} Zeichen`,
      recommendation: ownTitleLen === 0
        ? 'Füge einen Title-Tag mit 30–60 Zeichen hinzu.'
        : ownTitleLen < 30
          ? 'Dein Title ist zu kurz. Erweitere ihn auf 30–60 Zeichen mit relevanten Keywords.'
          : 'Dein Title ist zu lang. Kürze ihn auf maximal 60 Zeichen.',
    })
  }

  // Meta description
  const ownMetaLen = ownResult.metaDescription.length
  const competitorsWithMeta = reachableCompetitors.filter((c) => c.metaDescription.length > 0)
  if (ownMetaLen === 0 && competitorsWithMeta.length > 0) {
    gaps.push({
      label: 'Meta-Description',
      ownValue: 'Fehlend',
      bestValue: `${competitorsWithMeta[0].metaDescription.length} Zeichen`,
      recommendation: 'Füge eine Meta-Description mit 120–160 Zeichen hinzu. Sie beeinflusst die Klickrate in den Suchergebnissen.',
    })
  }

  // H1
  if (ownResult.h1s.length === 0 && reachableCompetitors.some((c) => c.h1s.length > 0)) {
    gaps.push({
      label: 'H1-Überschrift',
      ownValue: 'Fehlend',
      bestValue: 'Vorhanden',
      recommendation: 'Füge genau eine H1-Überschrift mit dem Haupt-Keyword deiner Seite hinzu.',
    })
  }

  // Word count
  const bestWordCount = Math.max(...reachableCompetitors.map((c) => c.wordCount))
  if (ownResult.wordCount < bestWordCount * 0.6 && bestWordCount > 200) {
    gaps.push({
      label: 'Wortanzahl',
      ownValue: `${ownResult.wordCount} Wörter`,
      bestValue: `${bestWordCount} Wörter`,
      recommendation: `Dein Content ist deutlich kürzer als der des besten Wettbewerbers. Erweitere deinen Inhalt auf mindestens ${Math.round(bestWordCount * 0.8)} Wörter mit thematisch relevantem Content.`,
    })
  }

  // Alt text coverage
  const ownAltCoverage = ownResult.images.total > 0
    ? Math.round(((ownResult.images.total - ownResult.images.withoutAlt) / ownResult.images.total) * 100)
    : 100
  const bestAltCoverage = Math.max(
    ...reachableCompetitors.map((c) =>
      c.images.total > 0
        ? Math.round(((c.images.total - c.images.withoutAlt) / c.images.total) * 100)
        : 100
    )
  )
  if (ownAltCoverage < bestAltCoverage - 20 && ownResult.images.withoutAlt > 0) {
    gaps.push({
      label: 'Alt-Text-Abdeckung',
      ownValue: `${ownAltCoverage}%`,
      bestValue: `${bestAltCoverage}%`,
      recommendation: `${ownResult.images.withoutAlt} Bild(er) haben keinen Alt-Text. Füge beschreibende Alt-Texte mit relevanten Keywords hinzu.`,
    })
  }

  // OG Tags
  if (!ownResult.hasOgTags && reachableCompetitors.some((c) => c.hasOgTags)) {
    gaps.push({
      label: 'Open Graph Tags',
      ownValue: 'Fehlend',
      bestValue: 'Vorhanden',
      recommendation: 'Füge Open Graph Meta-Tags hinzu (og:title, og:description, og:image) um die Darstellung beim Teilen in sozialen Netzwerken zu optimieren.',
    })
  }

  // Schema.org
  if (!ownResult.hasSchemaOrg && reachableCompetitors.some((c) => c.hasSchemaOrg)) {
    gaps.push({
      label: 'Schema.org Markup',
      ownValue: 'Fehlend',
      bestValue: 'Vorhanden',
      recommendation: 'Implementiere strukturierte Daten (JSON-LD) damit Suchmaschinen deine Inhalte besser verstehen und Rich Snippets anzeigen können.',
    })
  }

  // Canonical
  if (!ownResult.hasCanonical && reachableCompetitors.some((c) => c.hasCanonical)) {
    gaps.push({
      label: 'Canonical-Tag',
      ownValue: 'Fehlend',
      bestValue: 'Vorhanden',
      recommendation: 'Füge einen Canonical-Tag hinzu um Duplicate-Content-Probleme zu vermeiden.',
    })
  }

  return gaps.slice(0, 5)
}

// ---------------------------------------------------------------------------
// Comparison Table
// ---------------------------------------------------------------------------

function ComparisonTable({ data }: { data: ComparisonResult }) {
  const { results, ownUrl } = data
  const own = results[0]
  const competitors = results.slice(1)
  const allResults = results

  if (!own) return null

  const altCoverages = allResults.map((r) =>
    r.images.total > 0 ? Math.round(((r.images.total - r.images.withoutAlt) / r.images.total) * 100) : 100
  )
  const scoreRanks = rankValues(allResults.map((r) => r.score))
  const wordRanks = rankValues(allResults.map((r) => r.wordCount))
  const intLinkRanks = rankValues(allResults.map((r) => r.internalLinks))
  const extLinkRanks = rankValues(allResults.map((r) => r.externalLinks))
  const altRanks = rankValues(altCoverages)
  const canonicalRanks = rankBooleans(allResults.map((r) => r.hasCanonical))
  const ogRanks = rankBooleans(allResults.map((r) => r.hasOgTags))
  const schemaRanks = rankBooleans(allResults.map((r) => r.hasSchemaOrg))

  const titleLengths = allResults.map((r) => r.title.length)
  const titleLengthRanks = titleLengths.map((len): MetricRank => {
    if (len === 0) return 'worst'
    if (len >= 30 && len <= 60) return 'best'
    return 'middle'
  })

  const metaLengths = allResults.map((r) => r.metaDescription.length)
  const metaRanks = metaLengths.map((len): MetricRank => {
    if (len === 0) return 'worst'
    if (len >= 120 && len <= 160) return 'best'
    return 'middle'
  })

  const h1Ranks = allResults.map((r): MetricRank => {
    if (r.h1s.length === 1) return 'best'
    if (r.h1s.length === 0) return 'worst'
    return 'middle'
  })

  const winnerIdx = allResults.reduce(
    (best, curr, idx) => (curr.score > allResults[best].score ? idx : best),
    0
  )

  const metrics: Array<{
    label: string
    getValue: (r: SeoPageResult, idx: number) => string
    getRank: (idx: number) => MetricRank
  }> = [
    {
      label: 'SEO-Score',
      getValue: (r) => (r.error ? 'Fehler' : `${r.score}/100`),
      getRank: (i) => (allResults[i].error ? 'error' : scoreRanks[i]),
    },
    {
      label: 'Title-Tag',
      getValue: (r) => {
        if (r.title.length === 0) return 'Fehlend'
        const len = r.title.length
        const ok = len >= 30 && len <= 60
        return `${len} Z.${ok ? '' : len < 30 ? ' (zu kurz)' : ' (zu lang)'}`
      },
      getRank: (i) => (allResults[i].error ? 'error' : titleLengthRanks[i]),
    },
    {
      label: 'Meta-Description',
      getValue: (r) => r.metaDescription.length === 0 ? 'Fehlend' : `${r.metaDescription.length} Z.`,
      getRank: (i) => (allResults[i].error ? 'error' : metaRanks[i]),
    },
    {
      label: 'H1-Überschriften',
      getValue: (r) => r.h1s.length === 0 ? 'Fehlend' : `${r.h1s.length}× — ${r.h1s[0]?.slice(0, 30) ?? ''}${(r.h1s[0]?.length ?? 0) > 30 ? '…' : ''}`,
      getRank: (i) => (allResults[i].error ? 'error' : h1Ranks[i]),
    },
    {
      label: 'Wortanzahl',
      getValue: (r) => r.error ? 'Fehler' : `${r.wordCount}`,
      getRank: (i) => (allResults[i].error ? 'error' : wordRanks[i]),
    },
    {
      label: 'Alt-Text-Abdeckung',
      getValue: (r) => r.error ? 'Fehler' : `${altCoverages[allResults.indexOf(r)]}%`,
      getRank: (i) => (allResults[i].error ? 'error' : altRanks[i]),
    },
    {
      label: 'Interne Links',
      getValue: (r) => r.error ? 'Fehler' : `${r.internalLinks}`,
      getRank: (i) => (allResults[i].error ? 'error' : intLinkRanks[i]),
    },
    {
      label: 'Externe Links',
      getValue: (r) => r.error ? 'Fehler' : `${r.externalLinks}`,
      getRank: (i) => (allResults[i].error ? 'error' : extLinkRanks[i]),
    },
    {
      label: 'Canonical',
      getValue: (r) => r.error ? 'Fehler' : r.hasCanonical ? 'Ja' : 'Nein',
      getRank: (i) => (allResults[i].error ? 'error' : canonicalRanks[i]),
    },
    {
      label: 'Open Graph',
      getValue: (r) => r.error ? 'Fehler' : r.hasOgTags ? 'Ja' : 'Nein',
      getRank: (i) => (allResults[i].error ? 'error' : ogRanks[i]),
    },
    {
      label: 'Schema.org',
      getValue: (r) => r.error ? 'Fehler' : r.hasSchemaOrg ? 'Ja' : 'Nein',
      getRank: (i) => (allResults[i].error ? 'error' : schemaRanks[i]),
    },
  ]

  return (
    <div className="space-y-4">
      {/* Winner badge */}
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3">
        <Trophy className="h-5 w-5 shrink-0 text-emerald-600" />
        <p className="text-sm font-medium text-emerald-800">
          Beste URL: <span className="font-semibold">{extractHostname(allResults[winnerIdx].url)}</span>
          {' '}— Score {allResults[winnerIdx].score}/100
        </p>
      </div>

      {/* Table */}
      <p className="text-xs text-slate-400 dark:text-slate-500 md:hidden">← Tabelle scrollbar →</p>
      <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-border bg-slate-50 dark:bg-secondary">
              <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400 w-36">Metrik</th>
              {allResults.map((r, i) => (
                <th key={r.url} className="px-4 py-3 text-left font-medium text-slate-800 dark:text-slate-200">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      {i === 0 && (
                        <Badge className="rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50 text-[10px] px-1.5 py-0">
                          Eigene
                        </Badge>
                      )}
                      <span className="truncate max-w-[130px]" title={r.url}>
                        {extractHostname(r.url)}
                      </span>
                    </div>
                    {r.pagesAnalyzed !== undefined && r.pagesAnalyzed > 1 && (
                      <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">
                        {r.pagesAnalyzed} Seiten
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr
                key={metric.label}
                className="border-b border-slate-50 dark:border-[#1e2635] last:border-0 hover:bg-slate-50/50 dark:hover:bg-[#1e2635]/50 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">
                  {metric.label}
                </td>
                {allResults.map((r, i) => {
                  const rank = metric.getRank(i)
                  return (
                    <td key={r.url} className="px-4 py-3">
                      <div className={cn(
                        'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs',
                        rankBadge(rank)
                      )}>
                        <RankIcon rank={rank} />
                        <span>{metric.getValue(r, i)}</span>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gap Analysis view
// ---------------------------------------------------------------------------

function GapAnalysisSection({ data }: { data: ComparisonResult }) {
  const own = data.results[0]
  const competitors = data.results.slice(1)

  if (!own) return null

  const gaps = computeGapAnalysis(own, competitors)

  if (gaps.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-800">
            Keine kritischen Lücken gefunden. Deine URL performt vergleichbar mit den Wettbewerbern.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {gaps.map((gap) => (
        <div
          key={gap.label}
          className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 space-y-1"
        >
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm font-semibold text-amber-900">{gap.label}</p>
            <div className="flex items-center gap-2 shrink-0 text-xs">
              <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-red-700">Du: {gap.ownValue}</span>
              <span className="text-amber-500">→</span>
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">Beste: {gap.bestValue}</span>
            </div>
          </div>
          <p className="text-xs leading-5 text-amber-800">{gap.recommendation}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Result View
// ---------------------------------------------------------------------------

function CompareResultView({
  data,
  onBack,
  onDelete,
}: {
  data: ComparisonResult
  onBack: () => void
  onDelete?: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/tenant/seo/compare/${data.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Löschen fehlgeschlagen')
      toast({ description: 'Vergleich gelöscht.' })
      onDelete()
    } catch {
      toast({ description: 'Vergleich konnte nicht gelöscht werden.', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  const own = data.results[0]
  const competitors = data.results.slice(1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            className="rounded-full border-slate-200 dark:border-border bg-white dark:bg-card text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#1e2635]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Button>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {extractHostname(data.ownUrl)} vs. {competitors.map((c) => extractHostname(c.url)).join(', ')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(data.createdAt)}</p>
          </div>
        </div>
        {onDelete && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="rounded-full border-slate-200 dark:border-border text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Löschen
          </Button>
        )}
      </div>

      {own?.error && (
        <Alert className="rounded-2xl border-red-200 bg-red-50 text-red-800 [&>svg]:text-red-800">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Eigene URL nicht erreichbar</AlertTitle>
          <AlertDescription>
            {own.error}
            {own.error.includes('403') || own.error.toLowerCase().includes('verweigert') ? ' — Möglicherweise ist die Seite hinter einem Login oder einer Paywall.' : ''}
          </AlertDescription>
        </Alert>
      )}
      {data.results.some((r) => r.warning) && (
        <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-800 [&>svg]:text-amber-800">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Hinweis</AlertTitle>
          <AlertDescription>
            {data.results.filter((r) => r.warning).map((r) => `${extractHostname(r.url)}: ${r.warning}`).join(' · ')}
          </AlertDescription>
        </Alert>
      )}

      <Card className="rounded-[2rem] border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
        <CardHeader>
          <CardTitle className="text-base text-slate-950 dark:text-slate-50">Side-by-Side Vergleich</CardTitle>
        </CardHeader>
        <CardContent>
          <ComparisonTable data={data} />
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
        <CardHeader>
          <CardTitle className="text-base text-slate-950 dark:text-slate-50">Lückenanalyse — Top Verbesserungspotenziale</CardTitle>
        </CardHeader>
        <CardContent>
          <GapAnalysisSection data={data} />
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// History list
// ---------------------------------------------------------------------------

function CompareHistoryRow({
  item,
  onClick,
}: {
  item: ComparisonSummary
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card px-5 py-4 text-left shadow-soft hover:border-slate-200 dark:hover:border-[#3a4456] transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {extractHostname(item.ownUrl)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            vs. {item.competitorUrls.map(extractHostname).join(', ')}
          </p>
        </div>
        <p className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{formatDate(item.createdAt)}</p>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SeoCompareWorkspace() {
  const { activeCustomer, customers } = useActiveCustomer()
  const { toast } = useToast()

  const [view, setView] = useState<CompareView>({ type: 'list' })
  const [history, setHistory] = useState<ComparisonSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [ownUrl, setOwnUrl] = useState('')
  const [competitorUrls, setCompetitorUrls] = useState<string[]>([''])
  const [crawlMode, setCrawlMode] = useState<'single' | 'full-domain'>('single')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(activeCustomer?.id ?? 'none')
  const [customerFilter, setCustomerFilter] = useState<string>(activeCustomer?.id ?? 'all')
  const [submitting, setSubmitting] = useState(false)
  const [pendingUrls, setPendingUrls] = useState<string[]>([])

  useEffect(() => {
    setCustomerFilter(activeCustomer?.id ?? 'all')
  }, [activeCustomer])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const url = customerFilter !== 'all'
        ? `/api/tenant/seo/compare?customer_id=${customerFilter}`
        : '/api/tenant/seo/compare'
      const response = await fetch(url, { credentials: 'include' })
      if (!response.ok) throw new Error('Verlauf konnte nicht geladen werden.')
      const data = (await response.json()) as ComparisonSummary[]
      setHistory(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verlauf konnte nicht geladen werden.')
    } finally {
      setHistoryLoading(false)
    }
  }, [customerFilter])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const handleAddCompetitor = () => {
    if (competitorUrls.length < 3) {
      setCompetitorUrls((prev) => [...prev, ''])
    }
  }

  const handleRemoveCompetitor = (idx: number) => {
    setCompetitorUrls((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleCompetitorChange = (idx: number, value: string) => {
    setCompetitorUrls((prev) => prev.map((u, i) => (i === idx ? value : u)))
  }

  const handleSubmit = async () => {
    setError(null)

    const trimmedOwn = ownUrl.trim()
    const trimmedCompetitors = competitorUrls.map((u) => u.trim()).filter(Boolean)

    if (!trimmedOwn) {
      setError('Bitte gib deine eigene URL an.')
      return
    }
    if (trimmedCompetitors.length === 0) {
      setError('Bitte gib mindestens eine Wettbewerber-URL an.')
      return
    }

    setSubmitting(true)
    setPendingUrls([trimmedOwn, ...trimmedCompetitors])
    setView({ type: 'running' })

    try {
      const response = await fetch('/api/tenant/seo/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ownUrl: trimmedOwn,
          competitorUrls: trimmedCompetitors,
          crawlMode,
          maxPages: 10,
          customerId: selectedCustomerId === 'none' ? null : selectedCustomerId,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error ?? 'Vergleich fehlgeschlagen.')
      }

      const result = data as ComparisonResult
      setView({ type: 'results', data: result })
      void loadHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vergleich fehlgeschlagen.')
      setView({ type: 'list' })
    } finally {
      setSubmitting(false)
    }
  }

  const openComparison = async (id: string) => {
    try {
      const response = await fetch(`/api/tenant/seo/compare/${id}`, { credentials: 'include' })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error ?? 'Vergleich konnte nicht geladen werden.')
      setView({ type: 'results', data: data as ComparisonResult })
    } catch (e) {
      toast({ description: e instanceof Error ? e.message : 'Vergleich konnte nicht geladen werden.', variant: 'destructive' })
    }
  }

  if (view.type === 'running') {
    return (
      <Card className="rounded-[2rem] border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
        <CardContent className="flex flex-col items-center gap-6 px-6 py-14 text-center">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-slate-100 dark:border-border" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-blue-600" />
            <GitCompare className="h-8 w-8 text-blue-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Vergleich läuft</h2>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              Alle URLs werden parallel analysiert. Das dauert ca. 10–20 Sekunden.
            </p>
          </div>
          {pendingUrls.length > 0 && (
            <div className="w-full max-w-md space-y-2">
              {pendingUrls.map((url, i) => (
                <div key={url} className="flex items-center gap-2 rounded-xl border border-slate-100 dark:border-border bg-slate-50 dark:bg-secondary px-4 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 shrink-0" />
                  <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{i === 0 ? '(Eigene) ' : `(Wettbewerber ${i}) `}{extractHostname(url)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  if (view.type === 'results') {
    return (
      <CompareResultView
        data={view.data}
        onBack={() => setView({ type: 'list' })}
        onDelete={() => {
          setHistory((prev) => prev.filter((h) => h.id !== view.data.id))
          setView({ type: 'list' })
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Form */}
      <Card className="rounded-[2rem] border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl text-slate-950 dark:text-slate-50">
            <GitCompare className="h-5 w-5 text-blue-600" />
            Neuen Wettbewerbervergleich starten
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-800 [&>svg]:text-amber-800">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Vergleich konnte nicht gestartet werden</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800 dark:text-slate-200">Kunde</label>
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger className="h-12 rounded-2xl border-slate-200 dark:border-border bg-slate-50 dark:bg-secondary">
                <SelectValue placeholder="Ohne Kunde vergleichen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ohne Kunde</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              Optional. Der Vergleich kann auch ohne Kundenzuordnung gespeichert werden.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800 dark:text-slate-200">Deine URL</label>
            <Input
              value={ownUrl}
              onChange={(e) => setOwnUrl(e.target.value)}
              placeholder="https://deine-website.de/seite"
              className="h-12 rounded-2xl border-slate-200 dark:border-border bg-slate-50 dark:bg-secondary text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Wettbewerber-URLs <span className="text-slate-400 font-normal">(min. 1, max. 3)</span>
            </label>
            <div className="space-y-2">
              {competitorUrls.map((url, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={url}
                    onChange={(e) => handleCompetitorChange(idx, e.target.value)}
                    placeholder={`https://wettbewerber-${idx + 1}.de/seite`}
                    className="h-12 rounded-2xl border-slate-200 dark:border-border bg-slate-50 dark:bg-secondary text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                  />
                  {competitorUrls.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveCompetitor(idx)}
                      className="shrink-0 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {competitorUrls.length < 3 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCompetitor}
                className="rounded-full border-slate-200 dark:border-border text-slate-600 dark:text-slate-300"
              >
                <Plus className="h-4 w-4" />
                Wettbewerber hinzufügen
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800 dark:text-slate-200">Analyse-Modus</label>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { value: 'single', label: 'Einzelne Seite', description: 'Analysiert nur die angegebene URL.' },
                { value: 'full-domain', label: 'Gesamte Domain', description: 'Crawlt bis zu 10 Seiten via Sitemap.' },
              ].map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setCrawlMode(mode.value as 'single' | 'full-domain')}
                  className={cn(
                    'rounded-2xl border px-4 py-4 text-left transition',
                    crawlMode === mode.value
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30'
                      : 'border-slate-100 dark:border-border bg-slate-50 dark:bg-secondary hover:border-slate-200 dark:hover:border-[#3a4456]'
                  )}
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{mode.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{mode.description}</p>
                </button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            variant="dark"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Vergleich läuft
              </>
            ) : (
              <>
                <GitCompare className="h-4 w-4" />
                Vergleich starten
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Vergleiche</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Gespeicherte Wettbewerbervergleiche für diesen Tenant.</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-[220px] rounded-full">
                <SelectValue placeholder="Kunde filtern" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kunden</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge className="rounded-full bg-slate-50 dark:bg-card text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1e2635]">
              {history.length} Einträge
            </Badge>
          </div>
        </div>

        {historyLoading ? (
          <Card className="rounded-[2rem] border border-slate-100 dark:border-border bg-white dark:bg-card">
            <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verlauf wird geladen
            </CardContent>
          </Card>
        ) : history.length === 0 ? (
          <Card className="rounded-[2rem] border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
            <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                <GitCompare className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Noch keine Vergleiche</p>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Starte oben deinen ersten Wettbewerbervergleich.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <CompareHistoryRow
                key={item.id}
                item={item}
                onClick={() => void openComparison(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
