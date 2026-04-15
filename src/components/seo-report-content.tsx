'use client'

import { AlertCircle, CheckCircle2, Sparkles, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { SeoAnalysisResult, SeoCrawlMode } from '@/lib/seo-analysis'

// ── helpers ──────────────────────────────────────────────────────────────────

export function scoreTone(score: number) {
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

export function scoreLabel(score: number) {
  if (score >= 80) return 'Stark'
  if (score >= 60) return 'Mittel'
  return 'Kritisch'
}

export function formatCrawlModeLabel(crawlMode: SeoCrawlMode) {
  if (crawlMode === 'single') return 'einzelne Seite'
  if (crawlMode === 'multiple') return 'mehrere Seiten'
  return 'gesamte Domain'
}

export function formatDate(value: string) {
  return new Date(value).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function sanitizeSeoText(text: string) {
  const namedEntities: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
    copy: '©', reg: '®', trade: '™',
  }
  return text
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, value: string) => {
      const n = value.toLowerCase()
      if (n.startsWith('#x')) {
        const cp = Number.parseInt(n.slice(2), 16)
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : entity
      }
      if (n.startsWith('#')) {
        const cp = Number.parseInt(n.slice(1), 10)
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : entity
      }
      return namedEntities[n] ?? entity
    })
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractHostname(rawUrl: string | null | undefined) {
  if (!rawUrl) return null
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '')
  } catch {
    return rawUrl
  }
}

export function extractInsightSection(text: string, heading: string) {
  const lines = text.split('\n')
  const sections = new Map<string, string[]>()
  let current = ''
  for (const line of lines) {
    if (line.startsWith('## ')) {
      current = line.replace(/^## /, '').trim()
      if (!sections.has(current)) sections.set(current, [])
      continue
    }
    if (!current) continue
    sections.get(current)?.push(line)
  }
  return (sections.get(heading) ?? []).join('\n').trim()
}

export function getTechnicalCheckDescription(label: string) {
  const descriptions: Record<string, string> = {
    HTTPS: 'Prüft, ob die Seite verschlüsselt per HTTPS ausgeliefert wird.',
    'Viewport Meta': 'Wichtig für saubere Darstellung auf mobilen Geräten.',
    'Charset definiert': 'Legt die Zeichenkodierung fest.',
    'Favicon vorhanden': 'Hilft bei Wiedererkennbarkeit in Browser-Tabs und Bookmarks.',
    'Strukturierte Daten': 'Schema-Markup erleichtert Suchmaschinen das Verstehen.',
    'Hreflang Tags': 'Zeigt Suchmaschinen die passenden Sprach-/Länderversionen.',
    'Robots Meta': 'Steuert Indexierung und Link-Verfolgung durch Suchmaschinen.',
  }
  return descriptions[label] ?? ''
}

// ── sub-components ────────────────────────────────────────────────────────────

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
            <div key={`${line}-${index}`} className="flex items-start gap-2 text-sm leading-6 text-slate-600">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
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

function IssueList({ issues }: { issues: string[] }) {
  if (issues.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Keine kritischen Probleme erkannt.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <div
          key={issue}
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{issue}</span>
        </div>
      ))}
    </div>
  )
}

// ── main export ───────────────────────────────────────────────────────────────

export function SeoReportContent({
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
  const printablePages = [...result.pages].sort((a, b) => {
    const ae = Boolean(a.error), be = Boolean(b.error)
    if (ae && !be) return 1
    if (!ae && be) return -1
    if (ae && be) return 0
    return a.score - b.score
  })

  return (
    <div className="mx-auto w-full max-w-[186mm] bg-white text-slate-900">
      {/* Cover */}
      <section className="rounded-2xl bg-slate-900 p-8 text-white">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-400">
              SEO-Analyse Report
            </p>
            <h1 className="text-3xl font-bold tracking-tight">SEO-Analyse</h1>
            <p className="text-sm font-semibold text-blue-400">{tenantName} · {tenantSlug}</p>
          </div>
          <div className="flex shrink-0 items-center">
            {tenantLogoUrl ? (
              <img
                src={tenantLogoUrl}
                alt={`${tenantName} Logo`}
                className="max-h-14 max-w-[160px] object-contain brightness-0 invert"
              />
            ) : (
              <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-right">
                <p className="text-sm font-semibold text-white">{tenantName}</p>
                <p className="text-xs text-slate-400">Agentur</p>
              </div>
            )}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { label: 'Domain', value: extractHostname(sourceUrl) ?? '–' },
            { label: 'Crawl-Modus', value: crawlMode ? formatCrawlModeLabel(crawlMode) : '–' },
            { label: 'Erstellt am', value: createdAt ? formatDate(createdAt) : '–' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-slate-800 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">{item.label}</p>
              <p className="mt-1.5 text-base font-semibold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Score + KPIs */}
      <section className="mt-5 flex items-center gap-6">
        <div className={cn('flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full border-8', tone.bg)}>
          <span className={cn('text-4xl font-bold', tone.text)}>{result.overallScore}</span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {scoreLabel(result.overallScore)}
          </span>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Seiten</p>
            <p className="mt-1.5 text-2xl font-bold text-slate-900">{result.totalPages}</p>
            <p className="mt-0.5 text-xs text-slate-500">Analysiert</p>
          </div>
          <div className="rounded-xl bg-blue-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Erreichbar</p>
            <p className="mt-1.5 text-2xl font-bold text-blue-700">{result.pages.filter((p) => !p.error).length}</p>
            <p className="mt-0.5 text-xs text-slate-500">Öffentlich</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Kritisch</p>
            <p className="mt-1.5 text-2xl font-bold text-amber-700">
              {result.pages.filter((p) => p.score < 60 || p.error).length}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Handlungsbedarf</p>
          </div>
        </div>
      </section>

      {/* Insights */}
      <section className="mt-5 grid grid-cols-2 gap-4">
        <Card className="rounded-xl border border-slate-100 bg-slate-50 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Kritische Probleme
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownInsights text={criticalProblems || '- Keine kritischen Muster erkannt.'} />
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-slate-100 bg-slate-50 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles className="h-4 w-4 text-blue-600" />
              Handlungsempfehlungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownInsights
              text={recommendations || '- Feinschliff und Priorisierung der schwächsten Seiten empfohlen.'}
            />
          </CardContent>
        </Card>
      </section>

      {/* Technical SEO */}
      {result.technicalSeo ? (
        <section className="mt-5">
          <Card className="rounded-xl border border-slate-100 bg-white shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Zap className="h-4 w-4 text-blue-600" />
                Technisches SEO
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3">
                {result.technicalSeo.checks.map((check) => (
                  <div
                    key={check.label}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-sm',
                      check.ok
                        ? 'border-blue-100 bg-blue-50 text-blue-700'
                        : 'border-amber-200 bg-amber-50 text-amber-800',
                    )}
                  >
                    <div className="flex items-center gap-1.5 font-medium">
                      {check.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                      <span className="text-xs">{check.label}</span>
                    </div>
                    {(check.description ?? getTechnicalCheckDescription(check.label)) ? (
                      <p className="mt-1.5 text-[10px] leading-4 opacity-80">
                        {check.description ?? getTechnicalCheckDescription(check.label)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {/* Pages */}
      <section className="mt-5 space-y-3">
        <div className="border-b border-slate-200 pb-2">
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Seiten im Detail</h2>
          <p className="text-xs text-slate-400">Nach Score sortiert — schwächste zuerst.</p>
        </div>
        {printablePages.map((page) => (
          <Card key={page.url} className="rounded-xl border border-slate-100 bg-white shadow-none" style={{ breakInside: 'avoid' }}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    {sanitizeSeoText(page.title) || extractHostname(page.url) || 'Seite'}
                  </CardTitle>
                  <p className="mt-0.5 break-all text-xs text-slate-400">{page.url}</p>
                </div>
                <Badge className={cn('shrink-0 rounded-full text-xs', scoreTone(page.score).badge)}>
                  Score {page.score}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Title', value: sanitizeSeoText(page.title) || '—' },
                  { label: 'Meta Description', value: sanitizeSeoText(page.metaDescription) || '—' },
                  { label: 'Headlines', value: `${page.h1s.length} H1 · ${page.h2s.length} H2` },
                  {
                    label: 'Content',
                    value: `${page.wordCount} Wörter · ${page.images.total} Bilder${page.images.withoutAlt > 0 ? ` · ${page.images.withoutAlt} ohne Alt` : ''}`,
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{item.label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-700">{item.value}</p>
                  </div>
                ))}
              </div>
              <IssueList issues={page.issues} />
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
