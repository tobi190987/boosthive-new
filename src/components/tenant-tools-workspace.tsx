'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
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

function MarkdownInsights({ text }: { text: string }) {
  const lines = text.split('\n')

  return (
    <div className="space-y-3">
      {lines.map((line, index) => {
        if (!line.trim()) return null

        if (line.startsWith('## ')) {
          return (
            <h3 key={`${line}-${index}`} className="text-sm font-semibold text-slate-900">
              {line.replace(/^## /, '')}
            </h3>
          )
        }

        if (line.startsWith('- ')) {
          return (
            <div
              key={`${line}-${index}`}
              className="flex items-start gap-2 text-sm leading-6 text-slate-600"
            >
              <span className="mt-[9px] h-1.5 w-1.5 rounded-full bg-[#0d9488]" />
              <span>{line.replace(/^- /, '')}</span>
            </div>
          )
        }

        return (
          <p key={`${line}-${index}`} className="text-sm leading-6 text-slate-600">
            {line}
          </p>
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
          className="flex items-start gap-2 rounded-2xl border border-[#f2ddd0] bg-[#fff6f0] px-4 py-3 text-sm text-[#9a5a32]"
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
          title: page.title,
          metaDescription: page.metaDescription,
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
    <Card className="rounded-[28px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
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
              <p className="truncate text-sm font-semibold text-slate-900">
                {page.title || 'Kein Title vorhanden'}
              </p>
              <p className="truncate text-xs text-slate-500">{page.url}</p>
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
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>

      {open && (
        <CardContent className="space-y-5 border-t border-[#efe7dc] pt-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl bg-[#f7f3ed] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                <Type className="h-3.5 w-3.5" />
                Title
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {page.title || 'Nicht vorhanden'}
              </p>
            </div>
            <div className="rounded-2xl bg-[#f7f3ed] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                <Type className="h-3.5 w-3.5" />
                Meta Description
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {page.metaDescription || 'Nicht vorhanden'}
              </p>
            </div>
            <div className="rounded-2xl bg-[#f7f3ed] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                <Globe className="h-3.5 w-3.5" />
                Headings
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                H1: {page.h1s.length} · H2: {page.h2s.length}
              </p>
            </div>
            <div className="rounded-2xl bg-[#f7f3ed] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                <ImageIcon className="h-3.5 w-3.5" />
                Bilder
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {page.images.withoutAlt} ohne Alt-Text von {page.images.total}
              </p>
            </div>
            <div className="rounded-2xl bg-[#f7f3ed] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                <FileSearch className="h-3.5 w-3.5" />
                Inhalt
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{page.wordCount} Wörter</p>
            </div>
            <div className="rounded-2xl bg-[#f7f3ed] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                <Link2 className="h-3.5 w-3.5" />
                Links
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
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
                className="rounded-full border-[#d7efe9] bg-[#edf8f6] text-[#0d7d72] hover:bg-[#e4f5f1]"
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
              className="inline-flex items-center gap-2 rounded-full border border-[#ded4c7] bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-[#f7f3ed]"
            >
              URL öffnen
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <IssueList issues={page.issues} />

          {actions ? (
            <div className="space-y-4 rounded-[24px] border border-[#d7efe9] bg-[#f4fbf8] p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#0d9488]" />
                <p className="text-sm font-semibold text-slate-900">KI-Verbesserungsvorschläge</p>
                <Badge
                  className={cn(
                    'rounded-full',
                    actions.source === 'anthropic'
                      ? 'bg-[#edf8f6] text-[#0d9488] hover:bg-[#edf8f6]'
                      : 'bg-[#fff1e8] text-[#a35a34] hover:bg-[#fff1e8]'
                  )}
                >
                  {actions.source === 'anthropic' ? 'Claude' : 'Fallback'}
                </Badge>
              </div>
              <p className="text-sm leading-6 text-slate-600">{actions.summary}</p>
              {actions.debug ? (
                <div className="rounded-2xl border border-[#f2ddd0] bg-[#fff6f0] px-4 py-3 text-xs leading-5 text-[#9a5a32]">
                  Debug: {actions.debug}
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Neuer Title
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{actions.improvedTitle}</p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Neue Meta Description
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {actions.improvedMetaDescription}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Neue H1
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{actions.improvedH1}</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Weitere Ideen
                </p>
                {actions.contentIdeas.map((idea) => (
                  <div
                    key={idea}
                    className="flex items-start gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600"
                  >
                    <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-[#0d9488]" />
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
  result,
  analysisId,
  onBack,
}: {
  result: SeoAnalysisResult
  analysisId: string
  onBack: () => void
}) {
  const tone = scoreTone(result.overallScore)
  const [detailsPage, setDetailsPage] = useState(1)
  const criticalProblems = extractInsightSection(result.aiInsights, 'Kritische Probleme')
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
  const totalDetailPages = Math.max(1, Math.ceil(sortedPages.length / DETAIL_PAGE_SIZE))
  const paginatedPages = sortedPages.slice(
    (detailsPage - 1) * DETAIL_PAGE_SIZE,
    detailsPage * DETAIL_PAGE_SIZE
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="rounded-full border-[#ded4c7] bg-white text-slate-700 hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Zur Übersicht
        </Button>
        <Badge className="rounded-full bg-[#edf8f6] text-[#0d9488] hover:bg-[#edf8f6]">
          Analyse-ID: {analysisId.slice(0, 8)}
        </Badge>
      </div>

      <Card className="rounded-[28px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
        <CardHeader>
          <CardTitle className="text-xl text-slate-950">SEO-Analyse abgeschlossen</CardTitle>
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
              <span className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                {scoreLabel(result.overallScore)}
              </span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#f7f3ed] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Seiten
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{result.totalPages}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Analysierte URLs im Lauf</p>
            </div>
            <div className="rounded-2xl bg-[#edf8f6] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Erreichbar
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {result.pages.filter((page) => !page.error).length}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Öffentlich abrufbare Seiten
              </p>
            </div>
            <div className="rounded-2xl bg-[#fff1e8] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Kritisch
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {result.pages.filter((page) => page.score < 60 || page.error).length}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Seiten mit hohem Handlungsbedarf
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-[28px] border border-[#e6ddd0] bg-[#fffdf9] shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base text-slate-950">
              <AlertCircle className="h-5 w-5 text-[#b85e34]" />
              Kritische Probleme
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownInsights
              text={criticalProblems || '- Keine kritischen Muster erkannt.'}
            />
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border border-[#e6ddd0] bg-[#fffdf9] shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base text-slate-950">
              <Sparkles className="h-5 w-5 text-[#b85e34]" />
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
        <Card className="rounded-[28px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base text-slate-950">
              <Zap className="h-5 w-5 text-[#0d9488]" />
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
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-[#f7f3ed] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      {label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{value ?? '—'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <Alert className="rounded-[24px] border-[#e6ddd0] bg-[#f7f3ed]">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Lighthouse nicht konfiguriert</AlertTitle>
                <AlertDescription>
                  Für die erweiterten Scores fehlt aktuell `GOOGLE_PAGESPEED_API_KEY`. Die übrigen
                  technischen Checks wurden trotzdem durchgeführt.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {result.technicalSeo.checks.map((check) => (
                <div
                  key={check.label}
                  className={cn(
                    'rounded-2xl border px-4 py-3 text-sm',
                    check.ok
                      ? 'border-[#d7efe9] bg-[#edf8f6] text-[#0d7d72]'
                      : 'border-[#f2ddd0] bg-[#fff6f0] text-[#9a5a32]'
                  )}
                >
                  <div className="flex items-center gap-2 font-medium">
                    {check.ok ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    {check.label}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
          <h2 className="text-lg font-semibold text-slate-950">Seiten im Detail</h2>
          <p className="text-sm text-slate-500">
            Nach Score sortiert: schwächste Seiten zuerst, stärkste zuletzt.
          </p>
          </div>
          <Badge className="rounded-full bg-[#f7f3ed] text-slate-600 hover:bg-[#f7f3ed]">
            {(detailsPage - 1) * DETAIL_PAGE_SIZE + 1}-
            {Math.min(detailsPage * DETAIL_PAGE_SIZE, sortedPages.length)} von {sortedPages.length}
          </Badge>
        </div>
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
                    'rounded-full border border-[#ded4c7] bg-white text-slate-700 hover:bg-[#f7f3ed]',
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
                        ? 'border-[#0d9488] bg-[#edf8f6] text-[#0d9488]'
                        : 'text-slate-600 hover:bg-[#f7f3ed]'
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
                    'rounded-full border border-[#ded4c7] bg-white text-slate-700 hover:bg-[#f7f3ed]',
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

function AnalysisHistoryRow({
  analysis,
  onOpen,
  onDelete,
}: {
  analysis: SeoAnalysisSummary
  onOpen: () => void
  onDelete: () => void
}) {
  const progress =
    analysis.pagesTotal > 0 ? Math.round((analysis.pagesCrawled / analysis.pagesTotal) * 100) : 0
  const tone =
    analysis.overallScore !== null ? scoreTone(analysis.overallScore) : scoreTone(0)

  return (
    <Card className="rounded-[28px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-2xl border text-base font-bold',
              analysis.status === 'done'
                ? `${tone.bg} ${tone.text}`
                : 'border-[#dceee9] bg-[#edf8f6] text-[#0d9488]'
            )}
          >
            {analysis.status === 'running' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : analysis.status === 'error' ? (
              <AlertCircle className="h-5 w-5 text-[#b85e34]" />
            ) : (
              analysis.overallScore ?? '—'
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {analysis.config.urls[0] ?? 'SEO Analyse'}
              </p>
              <Badge className="rounded-full bg-[#f7f3ed] text-slate-600 hover:bg-[#f7f3ed]">
                {analysis.config.crawlMode}
              </Badge>
              {analysis.status === 'running' && (
                <Badge className="rounded-full bg-[#edf8f6] text-[#0d9488] hover:bg-[#edf8f6]">
                  Läuft
                </Badge>
              )}
              {analysis.status === 'error' && (
                <Badge className="rounded-full bg-[#fff1e8] text-[#a35a34] hover:bg-[#fff1e8]">
                  Fehler
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">{formatDate(analysis.createdAt)}</p>
          </div>
        </div>

        <div className="flex-1">
          {analysis.status === 'running' && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2 bg-[#ece4d8]" />
              <p className="text-xs text-slate-500">
                {analysis.pagesCrawled} / {analysis.pagesTotal || '?'} Seiten
              </p>
            </div>
          )}
          {analysis.status === 'done' && (
            <p className="text-sm text-slate-600">
              {analysis.totalPages ?? analysis.pagesCrawled} Seiten analysiert
            </p>
          )}
          {analysis.status === 'error' && (
            <p className="text-sm text-slate-600">
              Die Analyse konnte nicht abgeschlossen werden.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {(analysis.status === 'done' || analysis.status === 'running') && (
            <Button
              type="button"
              variant="outline"
              onClick={onOpen}
              className="rounded-full border-[#ded4c7] bg-white text-slate-700 hover:bg-white"
            >
              {analysis.status === 'running' ? 'Live-Ansicht' : 'Öffnen'}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onDelete}
            className="rounded-full border-[#f2ddd0] bg-white text-[#a35a34] hover:bg-[#fff6f0]"
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

function SeoAnalysisWorkspace() {
  const [view, setView] = useState<View>({ type: 'list' })
  const [analyses, setAnalyses] = useState<SeoAnalysisSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [crawlMode, setCrawlMode] = useState<SeoCrawlMode>('single')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { estimate, loading: estimateLoading, hasSitemap } = useSitemapEstimate(
    urlInput,
    crawlMode !== 'multiple'
  )

  const loadAnalyses = useCallback(async () => {
    try {
      const response = await fetch('/api/tenant/seo/analyses', { credentials: 'include' })
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
      return
    }

    if (data.result) {
      setView({ type: 'results', analysisId, result: data.result as SeoAnalysisResult })
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

      setView({ type: 'running', analysisId: pending.analysisId })
      setSubmitting(true)
      startPolling(pending.analysisId)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [startPolling])

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
      }
    },
    [view]
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
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? 'Analyse fehlgeschlagen.')
      }

      const result = (await response.json()) as SeoAnalysisResult
      stopPolling()
      localStorage.removeItem(STORAGE_KEY)
      setSubmitting(false)
      setView({ type: 'results', analysisId, result })
      void loadAnalyses()
    } catch (submitError) {
      stopPolling()
      localStorage.removeItem(STORAGE_KEY)
      setSubmitting(false)
      setView({ type: 'list' })
      setError(submitError instanceof Error ? submitError.message : 'Analyse fehlgeschlagen.')
      void loadAnalyses()
    }
  }, [crawlMode, loadAnalyses, startPolling, stopPolling, urlInput])

  if (view.type === 'results') {
    return (
      <SeoResultsView
        key={view.analysisId}
        analysisId={view.analysisId}
        result={view.result}
        onBack={() => setView({ type: 'list' })}
      />
    )
  }

  if (view.type === 'running') {
    const progress =
      runningSummary && runningSummary.pagesTotal > 0
        ? Math.round((runningSummary.pagesCrawled / runningSummary.pagesTotal) * 100)
        : 0

    return (
      <Card className="rounded-[32px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
        <CardContent className="flex flex-col items-center gap-6 px-6 py-14 text-center">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-[#dceee9]" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#0d9488]" />
            <Search className="h-8 w-8 text-[#0d9488]" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-slate-950">SEO-Analyse läuft</h2>
            <p className="text-sm leading-6 text-slate-600">
              {runningSummary?.pagesTotal
                ? `${runningSummary.pagesCrawled} von ${runningSummary.pagesTotal} Seiten analysiert`
                : 'Sitemap und Seiten werden gerade eingelesen.'}
            </p>
          </div>
          <div className="w-full max-w-md space-y-2">
            <Progress value={progress} className="h-2 bg-[#ece4d8]" />
            <p className="text-xs text-slate-500">{progress}%</p>
          </div>
          <p className="max-w-md text-xs leading-6 text-slate-500">
            Die Analyse läuft serverseitig weiter. Du kannst die Seite offen lassen oder später in
            den Verlauf zurückkehren.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setView({ type: 'list' })}
            className="rounded-full border-[#ded4c7] bg-white text-slate-700 hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Verlauf
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-[32px] border border-[#e6ddd0] bg-[#fffdf9] shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
            <Sparkles className="h-5 w-5 text-[#b85e34]" />
            SEO-Analyse
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3">
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="font-semibold text-slate-900">Onpage-Signale</p>
            <p>Title, Meta-Description, H1/H2, Wortanzahl und Alt-Texte pro Seite.</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="font-semibold text-slate-900">Technische Checks</p>
            <p>HTTPS, Viewport, Robots, Schema.org, Favicon und optional Lighthouse.</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="font-semibold text-slate-900">Verlauf & Wiederaufruf</p>
            <p>Abgeschlossene Analysen bleiben tenant-isoliert gespeichert und abrufbar.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[32px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
            <Search className="h-5 w-5 text-[#0d9488]" />
            Neue SEO-Analyse starten
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert className="rounded-[24px] border-[#f2ddd0] bg-[#fff6f0] text-[#9a5a32] [&>svg]:text-[#9a5a32]">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Analyse konnte nicht gestartet werden</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">Crawl-Modus</label>
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
                    'rounded-[24px] border px-4 py-4 text-left transition',
                    crawlMode === mode.value
                      ? 'border-[#0d9488] bg-[#edf8f6]'
                      : 'border-[#e6ddd0] bg-[#fffdf9] hover:border-[#d7ccbc]'
                  )}
                >
                  <p className="text-sm font-semibold text-slate-900">{mode.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{mode.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">
              {crawlMode === 'multiple' ? 'URLs (eine pro Zeile)' : 'URL'}
            </label>
            {crawlMode === 'multiple' ? (
              <Textarea
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                placeholder={'https://example.com/\nhttps://example.com/kontakt'}
                className="min-h-[150px] rounded-[24px] border-[#ded4c7] bg-[#fffdf9] text-slate-900 placeholder:text-slate-400"
              />
            ) : (
              <Input
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                placeholder="https://example.com"
                className="h-12 rounded-[24px] border-[#ded4c7] bg-[#fffdf9] text-slate-900 placeholder:text-slate-400"
              />
            )}

            {crawlMode !== 'multiple' && urlInput.trim() ? (
              <div
                className={cn(
                  'rounded-2xl border px-4 py-3 text-sm',
                  estimateLoading
                    ? 'border-[#e6ddd0] bg-[#f7f3ed] text-slate-500'
                    : hasSitemap
                      ? 'border-[#d7efe9] bg-[#edf8f6] text-[#0d7d72]'
                      : 'border-[#f2ddd0] bg-[#fff6f0] text-[#9a5a32]'
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
            <p className="text-xs leading-6 text-slate-500">
              Unterstützt Title, Meta-Description, Heading-Struktur, Links, Alt-Texte,
              Canonical, Open Graph und technische Checks.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Analysen-Verlauf</h2>
            <p className="text-sm text-slate-500">
              Vergangene und laufende SEO-Analysen für diesen Tenant.
            </p>
          </div>
          <Badge className="rounded-full bg-[#f7f3ed] text-slate-600 hover:bg-[#f7f3ed]">
            {analyses.length} Einträge
          </Badge>
        </div>

        {loading ? (
          <Card className="rounded-[28px] border border-[#e6ddd0] bg-white">
            <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verlauf wird geladen
            </CardContent>
          </Card>
        ) : analyses.length === 0 ? (
          <Card className="rounded-[28px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
            <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf8f6]">
                <Search className="h-6 w-6 text-[#0d9488]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Noch keine SEO-Analysen</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
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
              onOpen={() => {
                void openAnalysis(analysis.id).catch((openError) => {
                  setError(
                    openError instanceof Error
                      ? openError.message
                      : 'Analyse konnte nicht geladen werden.'
                  )
                })
              }}
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
    </div>
  )
}

export function TenantToolsWorkspace({
  role,
  activeModuleCodes,
}: {
  role: WorkspaceRole
  activeModuleCodes: string[]
}) {
  const seoEnabled = activeModuleCodes.includes('seo_analyse')

  return (
    <div className="space-y-6">
      {seoEnabled ? (
        <SeoAnalysisWorkspace />
      ) : (
        <Card className="rounded-[32px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-[#f7f3ed]">
              <Lock className="h-7 w-7 text-[#a35a34]" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-950">SEO Analyse ist noch gesperrt</h2>
              <p className="max-w-2xl text-sm leading-7 text-slate-600">
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
              <Badge className="rounded-full bg-[#fff1e8] text-[#a35a34] hover:bg-[#fff1e8]">
                Bitte Admin kontaktieren
              </Badge>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
