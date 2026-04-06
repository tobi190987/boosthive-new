'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileSearch,
  Globe,
  Image as ImageIcon,
  Info,
  Link2,
  Loader2,
  Lock,
  Search,
  Sparkles,
  Type,
  Zap,
} from 'lucide-react'
import type {
  SeoAnalysisResult,
  SeoAnalysisSummary,
  SeoCrawlMode,
  SeoPageResult,
} from '@/lib/seo-analysis'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Textarea } from '@/components/ui/textarea'
import { useActiveCustomer } from '@/lib/active-customer-context'
import { SeoCompareWorkspace } from '@/components/seo-compare-workspace'
import { NoCustomerSelected } from '@/components/no-customer-selected'

type WorkspaceRole = 'admin' | 'member'
type View =
  | { type: 'list' }
  | { type: 'running'; analysisId: string }
  | { type: 'results'; analysisId: string; result: SeoAnalysisResult }

const STORAGE_KEY = 'boosthive_seo_pending_analysis'
const DETAIL_PAGE_SIZE = 25

interface PageActionResult {
  summary: string
  improvedTitle: string
  improvedMetaDescription: string
  improvedH1: string
  contentIdeas: string[]
  source: 'anthropic' | 'fallback'
  debug?: string
}

interface CriticalProblemFilter {
  key: string
  label: string
  count: number
  matches: (page: SeoPageResult) => boolean
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

function scoreTone(score: number) {
  if (score >= 80) {
    return {
      text: 'text-emerald-700',
      bg: 'bg-emerald-50 border-emerald-200',
      badge: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50',
    }
  }

  if (score >= 60) {
    return {
      text: 'text-amber-700',
      bg: 'bg-amber-50 border-amber-200',
      badge: 'bg-amber-50 text-amber-700 hover:bg-amber-50',
    }
  }

  return {
    text: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
    badge: 'bg-red-50 text-red-700 hover:bg-red-50',
  }
}

function scoreLabel(score: number) {
  if (score >= 80) return 'Stark'
  if (score >= 60) return 'Mittel'
  return 'Kritisch'
}

function technicalBadge(ok: boolean) {
  return ok
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-red-200 bg-red-50 text-red-700'
}

function formatCrawlModeLabel(crawlMode: SeoCrawlMode) {
  if (crawlMode === 'single') return 'einzelne Seite'
  if (crawlMode === 'multiple') return 'mehrere Seiten'
  return 'gesamte Domain'
}

function decodeHtmlEntities(text: string) {
  const namedEntities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    hellip: '…',
    laquo: '«',
    raquo: '»',
    copy: '©',
    reg: '®',
    trade: '™',
  }

  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, value: string) => {
    const normalized = value.toLowerCase()

    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity
    }

    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity
    }

    return namedEntities[normalized] ?? entity
  })
}

function sanitizeSeoText(text: string) {
  return decodeHtmlEntities(text).replace(/\s+/g, ' ').trim()
}

function getAnalysisHref(analysisId: string) {
  return `/tools/seo-analyse/${analysisId}`
}

function extractHostname(rawUrl: string | null | undefined) {
  if (!rawUrl) return null

  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '')
  } catch {
    return rawUrl
  }
}

function getTechnicalCheckDescription(label: string) {
  const descriptions: Record<string, string> = {
    HTTPS: 'Prüft, ob die Seite verschlüsselt per HTTPS ausgeliefert wird.',
    'Viewport Meta':
      'Wichtig für saubere Darstellung und korrekte Skalierung auf mobilen Geräten.',
    'Charset definiert':
      'Legt die Zeichenkodierung fest, damit Umlaute und Sonderzeichen korrekt erscheinen.',
    'Favicon vorhanden':
      'Hilft bei Wiedererkennbarkeit in Browser-Tabs, Bookmarks und Suchergebnissen.',
    'Strukturierte Daten':
      'Schema-Markup erleichtert Suchmaschinen das Verstehen der Seiteninhalte.',
    'Hreflang Tags':
      'Zeigt Suchmaschinen die passenden Sprach- oder Länderversionen einer Seite.',
    'Robots Meta':
      'Steuert, ob und wie Suchmaschinen die Seite indexieren oder Links verfolgen sollen.',
  }

  return descriptions[label] ?? ''
}

function getLighthouseScoreDescription(label: string) {
  const descriptions: Record<string, string> = {
    Performance:
      'Bewertet Ladegeschwindigkeit, Stabilität und Reaktionsfähigkeit der Seite.',
    Accessibility:
      'Prüft, wie gut die Seite für Menschen mit Einschränkungen nutzbar ist.',
    'Best Practices':
      'Bewertet technische Qualitätsstandards wie Sicherheit, saubere Implementierung und moderne Web-Standards.',
    SEO: 'Prüft grundlegende technische und inhaltliche Voraussetzungen für gute Auffindbarkeit in Suchmaschinen.',
  }

  return descriptions[label] ?? ''
}

function MarkdownInsights({ text }: { text: string }) {
  const lines = text.split('\n')

  return (
    <div className="space-y-3">
      {lines.map((line, index) => {
        if (!line.trim()) return null

        if (line.startsWith('## ')) {
          return (
            <h3 key={`${line}-${index}`} className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {line.replace(/^## /, '')}
            </h3>
          )
        }

        if (line.startsWith('- ')) {
          return (
            <div
              key={`${line}-${index}`}
              className="flex items-start gap-2 text-sm leading-6 text-slate-600 dark:text-slate-300"
            >
              <span className="mt-[9px] h-1.5 w-1.5 rounded-full bg-blue-600" />
              <span>{line.replace(/^- /, '')}</span>
            </div>
          )
        }

        return (
          <p key={`${line}-${index}`} className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            {line}
          </p>
        )
      })}
    </div>
  )
}

function CriticalProblemList({
  filters,
  activeFilterKey,
  onSelect,
}: {
  filters: CriticalProblemFilter[]
  activeFilterKey: string | null
  onSelect: (filterKey: string | null) => void
}) {
  if (filters.length === 0) {
    return <MarkdownInsights text="- Keine kritischen Muster erkannt." />
  }

  return (
    <div className="space-y-2.5">
      {filters.map((filter) => {
        const isActive = filter.key === activeFilterKey

        return (
          <button
            key={filter.key}
            type="button"
            onClick={() => onSelect(isActive ? null : filter.key)}
            className={cn(
              'group flex w-full items-center justify-between gap-3 rounded-[22px] border px-3.5 py-3 text-left transition',
              isActive
                ? 'border-blue-100 bg-blue-50 text-blue-600'
                : 'border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] text-slate-800 dark:text-slate-200 hover:border-slate-200 hover:bg-slate-50 dark:hover:bg-[#1e2635]'
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={cn(
                  'mt-0.5 flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl border',
                  isActive
                    ? 'border-blue-200 bg-white dark:bg-[#151c28] text-blue-600'
                    : 'border-slate-200 dark:border-[#252d3a] bg-white/80 text-blue-600'
                )}
              >
                <AlertCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className={cn('text-sm font-semibold', isActive ? 'text-blue-600' : 'text-slate-900 dark:text-slate-100')}>
                  {filter.label}
                </p>
                {isActive ? (
                  <p className="mt-0.5 text-[11px] leading-4.5 text-blue-600/80">
                    Aktiv. Im Detailbereich siehst du jetzt zuerst genau diese Seiten.
                  </p>
                ) : null}
              </div>
            </div>
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition',
                isActive
                  ? 'border-blue-200 bg-white dark:bg-[#151c28] text-blue-600'
                  : 'border-slate-200 dark:border-[#252d3a] bg-white/80 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:hover:text-slate-300'
              )}
            >
              <ArrowRight className={cn('h-4 w-4 transition-transform', isActive && 'rotate-90')} />
            </div>
          </button>
        )
      })}
    </div>
  )
}

function extractInsightSection(text: string, heading: string) {
  const lines = text.split('\n')
  const sections = new Map<string, string[]>()
  let current = ''

  for (const line of lines) {
    if (line.startsWith('## ')) {
      current = line.replace(/^## /, '').trim()
      if (!sections.has(current)) {
        sections.set(current, [])
      }
      continue
    }

    if (!current) continue
    sections.get(current)?.push(line)
  }

  return (sections.get(heading) ?? []).join('\n').trim()
}

function IssueList({ issues }: { issues: string[] }) {
  if (issues.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Keine kritischen Probleme auf dieser Seite erkannt.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <div
          key={issue}
          className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{issue}</span>
        </div>
      ))}
    </div>
  )
}

function PageResultCard({ page }: { page: SeoPageResult }) {
  const [open, setOpen] = useState(false)
  const [actions, setActions] = useState<PageActionResult | null>(null)
  const [actionsLoading, setActionsLoading] = useState(false)
  const tone = scoreTone(page.score)
  const { toast } = useToast()
  const pageTitle = sanitizeSeoText(page.title)
  const pageMetaDescription = sanitizeSeoText(page.metaDescription)

  const generateActions = async () => {
    try {
      setActionsLoading(true)
      const response = await fetch('/api/tenant/seo/page-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          url: page.url,
          title: pageTitle,
          metaDescription: pageMetaDescription,
          h1s: page.h1s,
          wordCount: page.wordCount,
          issues: page.issues,
        }),
      })

      const data = (await response.json().catch(() => null)) as PageActionResult | { error?: string } | null
      if (!response.ok) {
        throw new Error(data && 'error' in data ? data.error : 'Vorschläge konnten nicht geladen werden.')
      }

      setActions(data as PageActionResult)
      if ((data as PageActionResult).source === 'fallback') {
        toast({
          title: 'Fallback statt Claude',
          description:
            (data as PageActionResult).debug ??
            'Claude wurde nicht verwendet. Bitte Dev-Server und API-Key prüfen.',
        })
      }
    } catch (error) {
      toast({
        title: 'KI-Vorschläge nicht verfügbar',
        description:
          error instanceof Error ? error.message : 'Die Optimierung konnte nicht erzeugt werden.',
      })
    } finally {
      setActionsLoading(false)
    }
  }

  return (
    <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-2xl border text-sm font-bold',
                tone.bg,
                tone.text
              )}
            >
              {page.error ? '!' : page.score}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {pageTitle || 'Kein Title vorhanden'}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{page.url}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={cn('rounded-full', tone.badge)}>
            {page.error
              ? 'Nicht erreichbar'
              : `${page.issues.length} Problem${page.issues.length === 1 ? '' : 'e'}`}
          </Badge>
          {open ? (
            <ChevronUp className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          )}
        </div>
      </button>

      {open && (
        <CardContent className="space-y-5 border-t border-slate-100 dark:border-[#252d3a] pt-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 dark:bg-[#151c28] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                <Type className="h-3.5 w-3.5" />
                Title
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                {pageTitle || 'Nicht vorhanden'}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-[#151c28] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                <Type className="h-3.5 w-3.5" />
                Meta Description
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                {pageMetaDescription || 'Nicht vorhanden'}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-[#151c28] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                <Globe className="h-3.5 w-3.5" />
                Headings
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                H1: {page.h1s.length} · H2: {page.h2s.length}
              </p>
              <div className="mt-2 space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                <p>
                  <span className="font-medium text-slate-900 dark:text-slate-100">H1:</span>{' '}
                  {page.h1s.length > 0 ? page.h1s.join(' | ') : 'Nicht vorhanden'}
                </p>
                <p>
                  <span className="font-medium text-slate-900 dark:text-slate-100">H2:</span>{' '}
                  {page.h2s.length > 0 ? page.h2s.join(' | ') : 'Nicht vorhanden'}
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-[#151c28] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                <ImageIcon className="h-3.5 w-3.5" />
                Bilder
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                {page.images.withoutAlt} ohne Alt-Text von {page.images.total}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-[#151c28] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                <FileSearch className="h-3.5 w-3.5" />
                Inhalt
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">{page.wordCount} Wörter</p>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-[#151c28] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                <Link2 className="h-3.5 w-3.5" />
                Links
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                Intern {page.internalLinks} · Extern {page.externalLinks}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge className={cn('rounded-full', technicalBadge(page.hasCanonical))}>Canonical</Badge>
            <Badge className={cn('rounded-full', technicalBadge(page.hasOgTags))}>Open Graph</Badge>
            <Badge className={cn('rounded-full', technicalBadge(page.hasSchemaOrg))}>Schema.org</Badge>
            {!page.error && page.issues.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void generateActions()}
                disabled={actionsLoading}
                className="rounded-full border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-50"
              >
                {actionsLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    KI erstellt Vorschläge
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Mit KI verbessern
                  </>
                )}
              </Button>
            ) : null}
            <a
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-[#1e2635]"
            >
              URL öffnen
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <IssueList issues={page.issues} />

          {actions ? (
            <div className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">KI-Verbesserungsvorschläge</p>
                <Badge
                  className={cn(
                    'rounded-full',
                    actions.source === 'anthropic'
                      ? 'bg-blue-50 text-blue-600 hover:bg-blue-50'
                      : 'bg-slate-100 dark:bg-[#1e2635] text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252d3a]'
                  )}
                >
                  {actions.source === 'anthropic' ? 'Claude' : 'Fallback'}
                </Badge>
              </div>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{actions.summary}</p>
              {actions.debug ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                  Debug: {actions.debug}
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-white dark:bg-[#151c28] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                    Neuer Title
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                    {sanitizeSeoText(actions.improvedTitle)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white dark:bg-[#151c28] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                    Neue Meta Description
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                    {sanitizeSeoText(actions.improvedMetaDescription)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white dark:bg-[#151c28] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                    Neue H1
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">{actions.improvedH1}</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                  Weitere Ideen
                </p>
                {actions.contentIdeas.map((idea) => (
                  <div
                    key={idea}
                    className="flex items-start gap-2 rounded-2xl bg-white dark:bg-[#151c28] px-4 py-3 text-sm text-slate-600 dark:text-slate-300"
                  >
                    <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-blue-600" />
                    <span>{idea}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  )
}

function SeoResultsView({
  analysisId,
  result,
  tenantName,
  tenantSlug,
  tenantLogoUrl,
  createdAt,
  sourceUrl,
  crawlMode,
  onBack,
}: {
  analysisId: string
  result: SeoAnalysisResult
  tenantName: string
  tenantSlug: string
  tenantLogoUrl: string | null
  createdAt?: string | null
  sourceUrl?: string | null
  crawlMode?: SeoCrawlMode | null
  onBack: () => void
}) {
  const tone = scoreTone(result.overallScore)
  const [detailsPage, setDetailsPage] = useState(1)
  const [activeProblemFilterKey, setActiveProblemFilterKey] = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement | null>(null)
  const { toast } = useToast()
  const recommendations = extractInsightSection(result.aiInsights, 'Handlungsempfehlungen')
  const sortedPages = useMemo(
    () =>
      [...result.pages].sort((left, right) => {
        const leftError = Boolean(left.error)
        const rightError = Boolean(right.error)
        if (leftError && !rightError) return 1
        if (!leftError && rightError) return -1
        if (leftError && rightError) return 0
        return left.score - right.score
      }),
    [result.pages]
  )
  const criticalProblemFilters = useMemo<CriticalProblemFilter[]>(
    () =>
      [
        {
          key: 'missing-meta-description',
          label: `${result.pages.filter((page) => !page.metaDescription).length} Seiten ohne Meta-Description`,
          count: result.pages.filter((page) => !page.metaDescription).length,
          matches: (page: SeoPageResult) => !page.metaDescription,
        },
        {
          key: 'invalid-h1-structure',
          label: `${result.pages.filter((page) => page.h1s.length !== 1).length} Seiten mit fehlerhafter H1-Struktur`,
          count: result.pages.filter((page) => page.h1s.length !== 1).length,
          matches: (page: SeoPageResult) => page.h1s.length !== 1,
        },
        {
          key: 'missing-alt-text',
          label: `${result.pages.filter((page) => page.images.withoutAlt > 0).length} Seiten mit fehlenden Alt-Texten`,
          count: result.pages.filter((page) => page.images.withoutAlt > 0).length,
          matches: (page: SeoPageResult) => page.images.withoutAlt > 0,
        },
        {
          key: 'missing-title',
          label: `${result.pages.filter((page) => !page.title).length} Seiten ohne Title`,
          count: result.pages.filter((page) => !page.title).length,
          matches: (page: SeoPageResult) => !page.title,
        },
      ].filter((filter) => filter.count > 0),
    [result.pages]
  )
  const activeProblemFilter =
    criticalProblemFilters.find((filter) => filter.key === activeProblemFilterKey) ?? null
  const matchingPages = activeProblemFilter
    ? sortedPages.filter((page) => activeProblemFilter.matches(page))
    : sortedPages
  const hiddenPagesCount = activeProblemFilter ? sortedPages.length - matchingPages.length : 0
  const totalDetailPages = Math.max(1, Math.ceil(matchingPages.length / DETAIL_PAGE_SIZE))
  const paginatedPages = matchingPages.slice(
    (detailsPage - 1) * DETAIL_PAGE_SIZE,
    detailsPage * DETAIL_PAGE_SIZE
  )
  const handleProblemFilterSelect = useCallback((filterKey: string | null) => {
    setActiveProblemFilterKey(filterKey)
    setDetailsPage(1)
  }, [setDetailsPage])

  const handleExportPdf = useCallback(() => {
    if (!printRef.current) {
      toast({
        title: 'PDF konnte nicht vorbereitet werden',
        description: 'Der Report ist gerade noch nicht verfügbar.',
        variant: 'destructive',
      })
      return
    }

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((node) => node.outerHTML)
      .join('')
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.className = 'fixed right-0 top-0 h-0 w-0 border-0 opacity-0'
    document.body.appendChild(frame)

    const html = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <base href="${window.location.origin}" />
    <title>SEO-Analyse ${tenantSlug}-${analysisId.slice(0, 8)}</title>
    ${styles}
    <style>
      @page { size: A4; margin: 14mm 12mm; }
      html, body { background: #ffffff; }
      body {
        margin: 0;
        color: #0f172a;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .print-avoid-break {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    </style>
  </head>
  <body>
    ${printRef.current.innerHTML}
  </body>
</html>`

    const printWindow = frame.contentWindow
    if (!printWindow) {
      frame.remove()
      toast({
        title: 'PDF konnte nicht vorbereitet werden',
        description: 'Das Druckfenster konnte nicht initialisiert werden.',
        variant: 'destructive',
      })
      return
    }

    const cleanup = () => {
      window.setTimeout(() => {
        frame.remove()
      }, 1000)
    }

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()

    window.setTimeout(() => {
      printWindow.focus()
      printWindow.print()
      cleanup()
    }, 500)
  }, [analysisId, tenantSlug, toast])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="rounded-full border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#1e2635]"
        >
          <ArrowLeft className="h-4 w-4" />
          Zur Übersicht
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleExportPdf}
          className="rounded-full border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#1e2635]"
        >
          PDF speichern
        </Button>
      </div>

      <div className="pointer-events-none fixed left-[-10000px] top-0 w-[210mm] opacity-0">
        <div ref={printRef}>
          <SeoReportContent
            result={result}
            tenantName={tenantName}
            tenantSlug={tenantSlug}
            tenantLogoUrl={tenantLogoUrl}
            createdAt={createdAt}
            sourceUrl={sourceUrl}
            crawlMode={crawlMode}
          />
        </div>
      </div>

      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
        <CardHeader>
          <CardTitle className="text-xl text-slate-950 dark:text-slate-50">SEO-Analyse abgeschlossen</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 xl:grid-cols-[180px_1fr] xl:items-start">
          <div className="flex items-start justify-center xl:justify-start">
            <div
              className={cn(
                'flex h-32 w-32 flex-col items-center justify-center rounded-full border-8',
                tone.bg
              )}
            >
              <span className={cn('text-4xl font-bold', tone.text)}>{result.overallScore}</span>
              <span className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                {scoreLabel(result.overallScore)}
              </span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 dark:bg-[#151c28] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                Seiten
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{result.totalPages}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Analysierte URLs im Lauf</p>
            </div>
            <div className="rounded-2xl bg-blue-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                Erreichbar
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                {result.pages.filter((page) => !page.error).length}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Öffentlich abrufbare Seiten
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 dark:bg-[#1e2635] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                Kritisch
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                {result.pages.filter((page) => page.score < 60 || page.error).length}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Seiten mit hohem Handlungsbedarf
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base text-slate-950 dark:text-slate-50">
              <AlertCircle className="h-5 w-5 text-blue-600" />
              Kritische Probleme
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CriticalProblemList
              filters={criticalProblemFilters}
              activeFilterKey={activeProblemFilterKey}
              onSelect={handleProblemFilterSelect}
            />
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base text-slate-950 dark:text-slate-50">
              <Sparkles className="h-5 w-5 text-blue-600" />
              Handlungsempfehlungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownInsights
              text={
                recommendations ||
                '- Aktuell vor allem Feinschliff und Priorisierung der Seiten mit mittlerem Score sinnvoll.'
              }
            />
          </CardContent>
        </Card>
      </div>

      {result.technicalSeo && (
        <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base text-slate-950 dark:text-slate-50">
              <Zap className="h-5 w-5 text-blue-600" />
              Technisches SEO
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {result.technicalSeo.lighthouseScores ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Performance', result.technicalSeo.lighthouseScores.performance],
                  ['Accessibility', result.technicalSeo.lighthouseScores.accessibility],
                  ['Best Practices', result.technicalSeo.lighthouseScores.bestPractices],
                  ['SEO', result.technicalSeo.lighthouseScores.seo],
                ].map(([label, value]) => {
                  const description = getLighthouseScoreDescription(String(label))

                  return (
                    <div key={String(label)} className="rounded-2xl bg-slate-50 dark:bg-[#151c28] p-4">
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                          {String(label)}
                        </p>
                        {description ? (
                          <div className="group/info relative">
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 dark:text-slate-500 transition hover:text-slate-600 dark:hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                              aria-label={`Erklärung zu ${String(label)}`}
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                            <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 w-56 -translate-x-1/2 rounded-xl border border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-700 dark:text-slate-300 opacity-0 shadow-[0_16px_40px_rgba(15,23,42,0.12)] transition-opacity duration-150 group-hover/info:opacity-100 group-focus-within/info:opacity-100">
                              {description}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value ?? '—'}</p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <Alert className="rounded-2xl border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28]">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Lighthouse nicht konfiguriert</AlertTitle>
                <AlertDescription>
                  Für die erweiterten Scores fehlt aktuell `GOOGLE_PAGESPEED_API_KEY`. Die übrigen
                  technischen Checks wurden trotzdem durchgeführt.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {result.technicalSeo.checks.map((check) => {
                const description = check.description ?? getTechnicalCheckDescription(check.label)

                return (
                  <div
                    key={check.label}
                    className={cn(
                      'rounded-2xl border px-4 py-3 text-sm',
                      check.ok
                        ? 'border-blue-100 bg-blue-50 text-blue-600'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    )}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      {check.ok ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <AlertCircle className="h-4 w-4" />
                      )}
                      <span>{check.label}</span>
                      {description ? (
                        <div className="relative ml-auto">
                          <div className="group/info relative flex">
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-current/70 transition hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30"
                              aria-label={`Erklärung zu ${check.label}`}
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                            <div className="pointer-events-none absolute bottom-[calc(100%+8px)] right-0 z-20 w-56 rounded-xl border border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] px-3 py-2 text-xs font-normal leading-5 text-slate-700 dark:text-slate-300 opacity-0 shadow-[0_16px_40px_rgba(15,23,42,0.12)] transition-opacity duration-150 group-hover/info:opacity-100 group-focus-within/info:opacity-100">
                              {description}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Seiten im Detail</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {activeProblemFilter
                ? `Gefiltert nach: ${activeProblemFilter.label}. Diese Seiten stehen jetzt zuerst im Fokus.`
                : 'Nach Score sortiert: schwächste Seiten zuerst, stärkste zuletzt.'}
            </p>
          </div>
          <Badge className="rounded-full bg-slate-50 dark:bg-[#151c28] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1e2635]">
            {(detailsPage - 1) * DETAIL_PAGE_SIZE + 1}-
            {Math.min(detailsPage * DETAIL_PAGE_SIZE, matchingPages.length)} von {matchingPages.length}
          </Badge>
        </div>
        {activeProblemFilter ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-600">
            <span>{activeProblemFilter.label}</span>
            {hiddenPagesCount > 0 ? (
              <span className="text-blue-600">
                {hiddenPagesCount} weitere Seiten sind aktuell ausgeblendet.
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => handleProblemFilterSelect(null)}
              className="rounded-full border-blue-200 bg-white dark:bg-[#151c28] text-blue-600 hover:bg-white dark:hover:bg-[#1e2635]"
            >
              Filter zurücksetzen
            </Button>
          </div>
        ) : null}
        {paginatedPages.map((page) => (
          <PageResultCard key={page.url} page={page} />
        ))}
        {totalDetailPages > 1 ? (
          <Pagination className="justify-start">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(event) => {
                    event.preventDefault()
                    setDetailsPage((current) => Math.max(1, current - 1))
                  }}
                  className={cn(
                    'rounded-full border border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1e2635]',
                    detailsPage === 1 && 'pointer-events-none opacity-50'
                  )}
                />
              </PaginationItem>

              {Array.from({ length: totalDetailPages }, (_, index) => index + 1).map((page) => (
                <PaginationItem key={page}>
                  <PaginationLink
                    href="#"
                    isActive={page === detailsPage}
                    onClick={(event) => {
                      event.preventDefault()
                      setDetailsPage(page)
                    }}
                    className={cn(
                      'rounded-full',
                      page === detailsPage
                        ? 'border-blue-600 bg-blue-50 text-blue-600'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1e2635]'
                    )}
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              ))}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(event) => {
                    event.preventDefault()
                    setDetailsPage((current) => Math.min(totalDetailPages, current + 1))
                  }}
                  className={cn(
                    'rounded-full border border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1e2635]',
                    detailsPage === totalDetailPages && 'pointer-events-none opacity-50'
                  )}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ) : null}
      </div>
    </div>
  )
}

function SeoReportContent({
  result,
  tenantName,
  tenantSlug,
  tenantLogoUrl,
  createdAt,
  sourceUrl,
  crawlMode,
}: {
  result: SeoAnalysisResult
  tenantName: string
  tenantSlug: string
  tenantLogoUrl: string | null
  createdAt?: string | null
  sourceUrl?: string | null
  crawlMode?: SeoCrawlMode | null
}) {
  const tone = scoreTone(result.overallScore)
  const criticalProblems = extractInsightSection(result.aiInsights, 'Kritische Probleme')
  const recommendations = extractInsightSection(result.aiInsights, 'Handlungsempfehlungen')
  const printablePages = [...result.pages].sort((left, right) => {
    const leftError = Boolean(left.error)
    const rightError = Boolean(right.error)
    if (leftError && !rightError) return 1
    if (!leftError && rightError) return -1
    if (leftError && rightError) return 0
    return left.score - right.score
  })

  return (
    <div className="mx-auto w-full max-w-[210mm] bg-white dark:bg-[#151c28] p-8 text-slate-900 dark:text-slate-100">
      <section className="print-avoid-break rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] p-8">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-4">
            <Badge className="w-fit rounded-full bg-[#1f2937] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white hover:bg-[#1f2937]">
              SEO-Analyse Report
            </Badge>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
                {tenantName} / {tenantSlug}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                SEO-Analyse
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                Sauber aufbereiteter Report mit Prioritäten, technischen Checks und den
                wichtigsten Problemseiten.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end">
            {tenantLogoUrl ? (
              <img
                src={tenantLogoUrl}
                alt={`${tenantName} Logo`}
                className="max-h-16 max-w-[180px] object-contain"
              />
            ) : (
              <div className="rounded-2xl border border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] px-4 py-3 text-right">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tenantName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Agentur Branding</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-white/90 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
              Domain
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {extractHostname(sourceUrl) ?? 'Nicht verfügbar'}
            </p>
          </div>
          <div className="rounded-2xl bg-white/90 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
              Crawl-Modus
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {crawlMode ? formatCrawlModeLabel(crawlMode) : 'Nicht verfügbar'}
            </p>
          </div>
          <div className="rounded-2xl bg-white/90 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
              Erstellt am
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {createdAt ? formatDate(createdAt) : 'Nicht verfügbar'}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[180px_1fr] xl:items-start">
        <div className="print-avoid-break flex items-start justify-center xl:justify-start">
          <div
            className={cn(
              'flex h-32 w-32 flex-col items-center justify-center rounded-full border-8',
              tone.bg
            )}
          >
            <span className={cn('text-4xl font-bold', tone.text)}>{result.overallScore}</span>
            <span className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
              {scoreLabel(result.overallScore)}
            </span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="print-avoid-break rounded-2xl bg-slate-50 dark:bg-[#151c28] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
              Seiten
            </p>
            <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{result.totalPages}</p>
          </div>
          <div className="print-avoid-break rounded-2xl bg-blue-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
              Erreichbar
            </p>
            <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {result.pages.filter((page) => !page.error).length}
            </p>
          </div>
          <div className="print-avoid-break rounded-2xl bg-slate-100 dark:bg-[#1e2635] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
              Kritisch
            </p>
            <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {result.pages.filter((page) => page.score < 60 || page.error).length}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card className="print-avoid-break rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base text-slate-950 dark:text-slate-50">
              <AlertCircle className="h-5 w-5 text-blue-600" />
              Kritische Probleme
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownInsights text={criticalProblems || '- Keine kritischen Muster erkannt.'} />
          </CardContent>
        </Card>

        <Card className="print-avoid-break rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base text-slate-950 dark:text-slate-50">
              <Sparkles className="h-5 w-5 text-blue-600" />
              Handlungsempfehlungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownInsights
              text={
                recommendations ||
                '- Aktuell vor allem Feinschliff und Priorisierung der Seiten mit mittlerem Score sinnvoll.'
              }
            />
          </CardContent>
        </Card>
      </section>

      {result.technicalSeo ? (
        <section className="mt-6">
          <Card className="print-avoid-break rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base text-slate-950 dark:text-slate-50">
                <Zap className="h-5 w-5 text-blue-600" />
                Technisches SEO
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {result.technicalSeo.checks.map((check) => {
                  const description = check.description ?? getTechnicalCheckDescription(check.label)

                  return (
                    <div
                      key={check.label}
                      className={cn(
                        'print-avoid-break rounded-2xl border px-4 py-3 text-sm',
                        check.ok
                          ? 'border-blue-100 bg-blue-50 text-blue-600'
                          : 'border-amber-200 bg-amber-50 text-amber-800'
                      )}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        {check.ok ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <AlertCircle className="h-4 w-4" />
                        )}
                        <span>{check.label}</span>
                      </div>
                      {description ? (
                        <p className="mt-2 text-xs leading-5 text-current/80">{description}</p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="mt-6 space-y-4">
        <div className="print-avoid-break">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Seiten im Detail</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nach Score sortiert: schwächste Seiten zuerst, stärkste zuletzt.
          </p>
        </div>
        {printablePages.map((page) => (
          <Card
            key={page.url}
            className="print-avoid-break rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-none"
          >
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base text-slate-950 dark:text-slate-50">
                    {sanitizeSeoText(page.title) || extractHostname(page.url) || 'Seite'}
                  </CardTitle>
                  <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">{page.url}</p>
                </div>
                <Badge className={cn('rounded-full', scoreTone(page.score).badge)}>
                  Score {page.score}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 dark:bg-[#151c28] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                    Title
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                    {sanitizeSeoText(page.title) || 'Kein Title gefunden'}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 dark:bg-[#151c28] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                    Meta Description
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                    {sanitizeSeoText(page.metaDescription) || 'Keine Meta Description gefunden'}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 dark:bg-[#151c28] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                    Headlines
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                    {page.h1s.length} H1 / {page.h2s.length} H2
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 dark:bg-[#151c28] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                    Content
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                    {page.wordCount} Wörter, {page.images.total} Bilder, {page.images.withoutAlt}{' '}
                    ohne Alt
                  </p>
                </div>
              </div>
              <IssueList issues={page.issues} />
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}

function AnalysisHistoryRow({
  analysis,
  href,
  onDelete,
}: {
  analysis: SeoAnalysisSummary
  href: string
  onDelete: () => void
}) {
  const progress =
    analysis.pagesTotal > 0 ? Math.round((analysis.pagesCrawled / analysis.pagesTotal) * 100) : 0
  const tone =
    analysis.overallScore !== null ? scoreTone(analysis.overallScore) : scoreTone(0)

  return (
    <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-2xl border text-base font-bold',
              analysis.status === 'done'
                ? `${tone.bg} ${tone.text}`
                : 'border-slate-100 dark:border-[#252d3a] bg-blue-50 text-blue-600'
            )}
          >
            {analysis.status === 'running' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : analysis.status === 'error' ? (
              <AlertCircle className="h-5 w-5 text-blue-600" />
            ) : (
              analysis.overallScore ?? '—'
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {analysis.config.urls[0] ?? 'SEO Analyse'}
              </p>
              <Badge className="rounded-full bg-slate-50 dark:bg-[#151c28] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1e2635]">
                {formatCrawlModeLabel(analysis.config.crawlMode)}
              </Badge>
              {analysis.status === 'running' && (
                <Badge className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50">
                  Läuft
                </Badge>
              )}
              {analysis.status === 'error' && (
                <Badge className="rounded-full bg-slate-100 dark:bg-[#1e2635] text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252d3a]">
                  Fehler
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDate(analysis.createdAt)}</p>
          </div>
        </div>

        <div className="flex-1">
          {analysis.status === 'running' && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2 bg-slate-200 dark:bg-[#252d3a]" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {analysis.pagesCrawled} / {analysis.pagesTotal || '?'} Seiten
              </p>
            </div>
          )}
          {analysis.status === 'done' && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {analysis.totalPages ?? analysis.pagesCrawled} Seiten analysiert
            </p>
          )}
          {analysis.status === 'error' && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Die Analyse konnte nicht abgeschlossen werden.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {(analysis.status === 'done' || analysis.status === 'running') && (
            <Button asChild variant="outline" className="rounded-full border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#1e2635]">
              <Link href={href}>{analysis.status === 'running' ? 'Live-Ansicht' : 'Öffnen'}</Link>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onDelete}
            className="rounded-full border-amber-200 bg-white dark:bg-[#151c28] text-slate-400 dark:text-slate-500 hover:bg-amber-50"
          >
            Löschen
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function useSitemapEstimate(urlInput: string, enabled: boolean) {
  const [estimate, setEstimate] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasSitemap, setHasSitemap] = useState(false)

  useEffect(() => {
    if (!enabled || !urlInput.trim()) {
      setEstimate(null)
      setLoading(false)
      setHasSitemap(false)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(
          `/api/tenant/seo/estimate?url=${encodeURIComponent(urlInput.trim())}`,
          {
            credentials: 'include',
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          setEstimate(null)
          setHasSitemap(false)
          return
        }

        const data = (await response.json()) as { count?: number; hasSitemap?: boolean }
        setEstimate(typeof data.count === 'number' ? data.count : null)
        setHasSitemap(Boolean(data.hasSitemap))
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        setEstimate(null)
        setHasSitemap(false)
      } finally {
        setLoading(false)
      }
    }, 500)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, urlInput])

  return { estimate, loading, hasSitemap }
}

function SeoAnalysisWorkspace({
  tenantName,
  tenantSlug,
  tenantLogoUrl,
  initialAnalysisId,
}: {
  tenantName: string
  tenantSlug: string
  tenantLogoUrl: string | null
  initialAnalysisId?: string
}) {
  const router = useRouter()
  const { activeCustomer } = useActiveCustomer()
  const [view, setView] = useState<View>({ type: 'list' })
  const [analyses, setAnalyses] = useState<SeoAnalysisSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(Boolean(initialAnalysisId))
  const [urlInput, setUrlInput] = useState('')
  const [crawlMode, setCrawlMode] = useState<SeoCrawlMode>('single')
  const isMountedRef = useRef(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [activeTab, setActiveTab] = useState<'analyse' | 'compare'>('analyse')
  const { estimate, loading: estimateLoading, hasSitemap } = useSitemapEstimate(
    urlInput,
    crawlMode !== 'multiple'
  )

  const loadAnalyses = useCallback(async () => {
    try {
      const url = activeCustomer
        ? `/api/tenant/seo/analyses?customer_id=${activeCustomer.id}`
        : '/api/tenant/seo/analyses'
      const response = await fetch(url, { credentials: 'include' })
      if (!response.ok) {
        throw new Error('Verlauf konnte nicht geladen werden.')
      }
      const data = (await response.json()) as SeoAnalysisSummary[]
      setAnalyses(data)
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Verlauf konnte nicht geladen werden.'
      )
    } finally {
      setLoading(false)
    }
  }, [activeCustomer])

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const openAnalysis = useCallback(async (analysisId: string) => {
    const response = await fetch(`/api/tenant/seo/status/${analysisId}`, {
      credentials: 'include',
    })
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(data?.error ?? 'Analyse konnte nicht geladen werden.')
    }

    if (data.status === 'running') {
      setView({ type: 'running', analysisId })
      setDetailLoading(false)
      return
    }

    if (data.result) {
      setView({ type: 'results', analysisId, result: data.result as SeoAnalysisResult })
      setDetailLoading(false)
    }
  }, [])

  const startPolling = useCallback(
    (analysisId: string) => {
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/tenant/seo/status/${analysisId}`, {
            credentials: 'include',
          })
          if (!response.ok) return

          const data = await response.json()
          setAnalyses((current) =>
            current.map((analysis) =>
              analysis.id === analysisId
                ? {
                    ...analysis,
                    status: data.status,
                    pagesCrawled: data.pagesCrawled ?? analysis.pagesCrawled,
                    pagesTotal: data.pagesTotal ?? analysis.pagesTotal,
                    totalPages: data.result?.totalPages ?? analysis.totalPages,
                    overallScore: data.result?.overallScore ?? analysis.overallScore,
                    completedAt: data.completedAt ?? analysis.completedAt,
                  }
                : analysis
            )
          )

          if (data.status === 'done' && data.result) {
            stopPolling()
            localStorage.removeItem(STORAGE_KEY)
            setSubmitting(false)
            setView({
              type: 'results',
              analysisId,
              result: data.result as SeoAnalysisResult,
            })
            void loadAnalyses()
          }

          if (data.status === 'error') {
            stopPolling()
            localStorage.removeItem(STORAGE_KEY)
            setSubmitting(false)
            setView({ type: 'list' })
            setError(data.errorMsg ?? 'Analyse fehlgeschlagen.')
            void loadAnalyses()
          }
        } catch {
          return
        }
      }, 3000)
    },
    [loadAnalyses, stopPolling]
  )

  useEffect(() => {
    void loadAnalyses()
  }, [loadAnalyses])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const pending = JSON.parse(raw) as { analysisId: string; startedAt: number }
      if (Date.now() - pending.startedAt > 10 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY)
        return
      }

      if (initialAnalysisId && pending.analysisId !== initialAnalysisId) {
        return
      }

      setView({ type: 'running', analysisId: pending.analysisId })
      setSubmitting(true)
      startPolling(pending.analysisId)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [initialAnalysisId, startPolling])

  useEffect(() => {
    if (!initialAnalysisId) return

    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const pending = JSON.parse(raw) as { analysisId?: string }
        if (pending.analysisId === initialAnalysisId) {
          setDetailLoading(false)
          return
        }
      }
    } catch {
      // Ignore malformed local storage state and continue with remote loading.
    }

    let cancelled = false

    void openAnalysis(initialAnalysisId)
      .catch((openError) => {
        if (cancelled) return
        setError(
          openError instanceof Error
            ? openError.message
            : 'Analyse konnte nicht geladen werden.'
        )
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [initialAnalysisId, openAnalysis])

  useEffect(() => () => stopPolling(), [stopPolling])

  const runningSummary = useMemo(
    () =>
      view.type === 'running'
        ? analyses.find((analysis) => analysis.id === view.analysisId) ?? null
        : null,
    [analyses, view]
  )

  const handleDelete = useCallback(
    async (analysisId: string) => {
      const response = await fetch(`/api/tenant/seo/analyses/${analysisId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? 'Analyse konnte nicht gelöscht werden.')
      }

      setAnalyses((current) => current.filter((analysis) => analysis.id !== analysisId))
      if (view.type !== 'list' && view.analysisId === analysisId) {
        setView({ type: 'list' })
        router.push('/tools/seo-analyse')
      }
    },
    [router, view]
  )

  const handleSubmit = useCallback(async () => {
    setError(null)

    const urls = urlInput
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean)

    if (urls.length === 0) {
      setError('Bitte gib mindestens eine gültige URL an.')
      return
    }

    const analysisId = crypto.randomUUID()
    const optimisticSummary: SeoAnalysisSummary = {
      id: analysisId,
      status: 'running',
      pagesCrawled: 0,
      pagesTotal: 0,
      overallScore: null,
      totalPages: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      config: {
        urls,
        crawlMode,
        maxPages: 50,
      },
    }

    setAnalyses((current) => [optimisticSummary, ...current])
    setSubmitting(true)
    setView({ type: 'running', analysisId })
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        analysisId,
        startedAt: Date.now(),
      })
    )

    startPolling(analysisId)
    router.push(getAnalysisHref(analysisId))

    try {
      const response = await fetch('/api/tenant/seo/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          analysisId,
          urls,
          crawlMode,
          maxPages: 50,
          customerId: activeCustomer?.id ?? null,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? 'Analyse fehlgeschlagen.')
      }

      const result = (await response.json()) as SeoAnalysisResult
      stopPolling()
      localStorage.removeItem(STORAGE_KEY)
      if (!isMountedRef.current) return
      setSubmitting(false)
      setView({ type: 'results', analysisId, result })
      void loadAnalyses()
    } catch (submitError) {
      stopPolling()
      localStorage.removeItem(STORAGE_KEY)
      if (!isMountedRef.current) return
      setSubmitting(false)
      setView({ type: 'list' })
      setError(submitError instanceof Error ? submitError.message : 'Analyse fehlgeschlagen.')
      void loadAnalyses()
    }
  }, [crawlMode, loadAnalyses, router, startPolling, stopPolling, urlInput])

  if (view.type === 'results') {
    const analysisSummary = analyses.find((analysis) => analysis.id === view.analysisId) ?? null

    return (
      <SeoResultsView
        key={view.analysisId}
        analysisId={view.analysisId}
        result={view.result}
        tenantName={tenantName}
        tenantSlug={tenantSlug}
        tenantLogoUrl={tenantLogoUrl}
        createdAt={analysisSummary?.createdAt ?? null}
        sourceUrl={analysisSummary?.config.urls[0] ?? null}
        crawlMode={analysisSummary?.config.crawlMode ?? null}
        onBack={() => router.push('/tools/seo-analyse')}
      />
    )
  }

  if (detailLoading) {
    return (
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyse wird geladen
        </CardContent>
      </Card>
    )
  }

  if (view.type === 'running') {
    const progress =
      runningSummary && runningSummary.pagesTotal > 0
        ? Math.round((runningSummary.pagesCrawled / runningSummary.pagesTotal) * 100)
        : 0

    return (
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
        <CardContent className="flex flex-col items-center gap-6 px-6 py-14 text-center">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-slate-100 dark:border-[#252d3a]" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-blue-600" />
            <Search className="h-8 w-8 text-blue-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">SEO-Analyse läuft</h2>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {runningSummary?.pagesTotal
                ? `${runningSummary.pagesCrawled} von ${runningSummary.pagesTotal} Seiten analysiert`
                : 'Sitemap und Seiten werden gerade eingelesen.'}
            </p>
          </div>
          <div className="w-full max-w-md space-y-2">
            <Progress value={progress} className="h-2 bg-slate-200 dark:bg-[#252d3a]" />
            <p className="text-xs text-slate-500 dark:text-slate-400">{progress}%</p>
          </div>
          <p className="max-w-md text-xs leading-6 text-slate-500 dark:text-slate-400">
            Die Analyse läuft serverseitig weiter. Du kannst die Seite offen lassen oder später in
            den Verlauf zurückkehren.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/tools/seo-analyse')}
            className="rounded-full border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#1e2635]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Verlauf
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (initialAnalysisId) {
    return (
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
        <CardContent className="flex flex-col items-center gap-5 px-6 py-12 text-center">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Analyse nicht verfügbar</h2>
            <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              Diese SEO-Analyse konnte nicht geladen werden oder gehört nicht zu deinem Tenant.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/tools/seo-analyse')}
            className="rounded-full border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#1e2635]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Verlauf
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!activeCustomer) {
    return (
      <div className="space-y-6">
        <div className="flex gap-1 rounded-2xl border border-slate-100 bg-slate-50 p-1 w-fit dark:border-[#252d3a] dark:bg-[#1e2635]">
          <button
            type="button"
            onClick={() => setActiveTab('analyse')}
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'analyse'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-[#151c28] dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            )}
          >
            Analyse
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('compare')}
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'compare'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-[#151c28] dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            )}
          >
            Vergleich
          </button>
        </div>

        <NoCustomerSelected
          toolName={activeTab === 'compare' ? 'SEO Competitor Analyse' : 'SEO Analyse'}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#1e2635] p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('analyse')}
          className={cn(
            'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'analyse'
              ? 'bg-white dark:bg-[#151c28] text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          Analyse
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('compare')}
          className={cn(
            'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'compare'
              ? 'bg-white dark:bg-[#151c28] text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          Vergleich
        </button>
      </div>

      {activeTab === 'compare' && <SeoCompareWorkspace />}

      {activeTab === 'analyse' && (
      <>
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl text-slate-950 dark:text-slate-50">
            <Search className="h-5 w-5 text-blue-600" />
            Neue SEO-Analyse starten
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-800 [&>svg]:text-amber-800">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Analyse konnte nicht gestartet werden</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800 dark:text-slate-200">Crawl-Modus</label>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  value: 'single',
                  label: 'Einzelne Seite',
                  description: 'Für Landingpages oder einzelne URLs.',
                },
                {
                  value: 'multiple',
                  label: 'Mehrere Seiten',
                  description: 'Eine Liste mehrerer URLs analysieren.',
                },
                {
                  value: 'full-domain',
                  label: 'Gesamte Domain',
                  description: 'Versucht die Sitemap der Domain zu crawlen.',
                },
              ].map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setCrawlMode(mode.value as SeoCrawlMode)}
                  className={cn(
                    'rounded-2xl border px-4 py-4 text-left transition',
                    crawlMode === mode.value
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950'
                      : 'border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] hover:border-slate-200'
                  )}
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{mode.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{mode.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {crawlMode === 'multiple' ? 'URLs (eine pro Zeile)' : 'URL'}
            </label>
            {crawlMode === 'multiple' ? (
              <Textarea
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                placeholder={'https://example.com/\nhttps://example.com/kontakt'}
                className="min-h-[150px] rounded-2xl border-slate-200 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
            ) : (
              <Input
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                placeholder="https://example.com"
                className="h-12 rounded-2xl border-slate-200 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
            )}

            {crawlMode !== 'multiple' && urlInput.trim() ? (
              <div
                className={cn(
                  'rounded-2xl border px-4 py-3 text-sm',
                  estimateLoading
                    ? 'border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] text-slate-500 dark:text-slate-400'
                    : hasSitemap
                      ? 'border-blue-100 bg-blue-50 text-blue-600'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                )}
              >
                {estimateLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sitemap wird gesucht...
                  </div>
                ) : hasSitemap ? (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Sitemap gefunden. Es werden voraussichtlich etwa <strong>{estimate}</strong>{' '}
                      Seite{estimate === 1 ? '' : 'n'} gecrawlt.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Keine Sitemap erkannt. In diesem Fall wird nur die angegebene URL analysiert.
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyse startet
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Analyse starten
                </>
              )}
            </Button>
            <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
              Unterstützt Title, Meta-Description, Heading-Struktur, Links, Alt-Texte,
              Canonical, Open Graph und technische Checks.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Analysen-Verlauf</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Vergangene und laufende SEO-Analysen für diesen Tenant.
            </p>
          </div>
          <Badge className="rounded-full bg-slate-50 dark:bg-[#151c28] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1e2635]">
            {analyses.length} Einträge
          </Badge>
        </div>

        {loading ? (
          <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
            <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verlauf wird geladen
            </CardContent>
          </Card>
        ) : analyses.length === 0 ? (
          <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
            <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                <Search className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Noch keine SEO-Analysen</p>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Starte oben deine erste Analyse und speichere die Ergebnisse direkt im Tenant.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          analyses.map((analysis) => (
            <AnalysisHistoryRow
              key={analysis.id}
              analysis={analysis}
              href={getAnalysisHref(analysis.id)}
              onDelete={() => {
                void handleDelete(analysis.id).catch((deleteError) => {
                  setError(
                    deleteError instanceof Error
                      ? deleteError.message
                      : 'Analyse konnte nicht gelöscht werden.'
                  )
                })
              }}
            />
          ))
        )}
      </div>
      </>
      )}
    </div>
  )
}

export function TenantToolsWorkspace({
  role,
  activeModuleCodes,
  tenantName,
  tenantSlug,
  tenantLogoUrl,
  initialAnalysisId,
}: {
  role: WorkspaceRole
  activeModuleCodes: string[]
  tenantName: string
  tenantSlug: string
  tenantLogoUrl: string | null
  initialAnalysisId?: string
}) {
  const seoEnabled = activeModuleCodes.includes('seo_analyse')

  return (
    <div className="space-y-6">
      {seoEnabled ? (
        <SeoAnalysisWorkspace
          tenantName={tenantName}
          tenantSlug={tenantSlug}
          tenantLogoUrl={tenantLogoUrl}
          initialAnalysisId={initialAnalysisId}
        />
      ) : (
        <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 dark:bg-[#151c28]">
              <Lock className="h-7 w-7 text-slate-400 dark:text-slate-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">SEO Analyse ist noch gesperrt</h2>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                Das Modul ist bereits vorbereitet, aber für diesen Tenant noch nicht aktiv. Nach
                der Buchung steht dir hier direkt die Analyse-Oberfläche mit Verlauf und
                Ergebnisansicht zur Verfügung.
              </p>
            </div>
            {role === 'admin' ? (
              <Button asChild className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]">
                <Link href="/billing">
                  Zum Billing
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Badge className="rounded-full bg-slate-100 dark:bg-[#1e2635] text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252d3a]">
                Bitte Admin kontaktieren
              </Badge>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
