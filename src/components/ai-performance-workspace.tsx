'use client'

import { useRef, useState, useCallback, useEffect, DragEvent, ChangeEvent } from 'react'
import {
  Upload,
  FileText,
  X,
  Loader2,
  BarChart3,
  TrendingUp,
  TrendingDown,
  FileDown,
  RefreshCw,
  History,
  ChevronLeft,
  User,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { PreviewResult, AnalyzeResult, CompareResult, KPIs, PerformanceAnalysis } from '@/lib/performance/types'
import { useActiveCustomer } from '@/lib/active-customer-context'
import { readSessionCache, writeSessionCache } from '@/lib/client-cache'

// ─── Markdown renderer ────────────────────────────────────────────────────────

function inlineFormat(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-[#1e2635] text-xs font-mono text-slate-700 dark:text-slate-300">$1</code>')
}

function renderMarkdown(text: string): string {
  const rawLines = text.split('\n')
  const out: string[] = []
  let inUl = false
  let inOl = false
  let olContext: 'default' | 'massnahmen' = 'default'
  let tableLines: string[] = []
  let inSummarySection = false

  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false }
    if (inOl) { out.push('</ol>'); inOl = false; olContext = 'default' }
  }

  const flushTable = () => {
    if (tableLines.length === 0) return
    const rows = tableLines.filter(l => !/^\|[\s\-:|]+\|/.test(l.trim()))
    if (rows.length === 0) { tableLines = []; return }

    const parseRow = (l: string) =>
      l.trim().replace(/^\||\|$/g, '').split('|').map(c => inlineFormat(c.trim()))

    const [headerRow, ...bodyRows] = rows
    const headers = parseRow(headerRow)

    out.push(`<div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#252d3a] my-4 shadow-sm">`)
    out.push(`<table class="w-full text-sm border-collapse">`)
    out.push(`<thead><tr class="bg-slate-900">`)
    headers.forEach(h => out.push(`<th class="px-4 py-2.5 text-left text-xs font-semibold text-slate-200 whitespace-nowrap">${h}</th>`))
    out.push(`</tr></thead><tbody>`)
    bodyRows.forEach((row, i) => {
      const cells = parseRow(row)
      out.push(`<tr class="${i % 2 === 0 ? 'bg-white dark:bg-[#151c28]' : 'bg-slate-50 dark:bg-[#151c28]'} border-b border-slate-100 dark:border-[#252d3a] last:border-0 hover:bg-blue-50/30 transition-colors">`)
      cells.forEach((c, ci) => out.push(`<td class="px-4 py-2.5 text-xs ${ci === 0 ? 'font-medium text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-300'} whitespace-nowrap">${c}</td>`))
      out.push(`</tr>`)
    })
    out.push(`</tbody></table></div>`)
    tableLines = []
  }

  for (const raw of rawLines) {
    const line = inlineFormat(raw)

    if (/^\|/.test(raw.trim())) {
      closeList()
      tableLines.push(raw)
      continue
    } else {
      flushTable()
    }

    if (/^# (?!#)/.test(raw)) {
      closeList()
      const title = line.replace(/^# /, '')
      out.push(`<h1 class="text-lg font-bold mb-4 mt-2 text-slate-950 dark:text-slate-50">${title}</h1>`)
      continue
    }

    if (/^## /.test(raw)) {
      closeList()
      const title = line.replace(/^## /, '')
      const hasGood = /✓|gut|klick|interaktion|gewinn|stark|traffic|engagement/i.test(title)
      const hasBad = /✗|schlecht|bremst|alarm|schwach|kostet zu viel/i.test(title)
      const isSummary = /zusammenfassung/i.test(title)
      inSummarySection = isSummary

      if (isSummary) {
        out.push(`<div class="mt-8 mb-2 flex items-center gap-2"><span class="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">${title}</span></div>`)
      } else if (hasGood) {
        out.push(`<div class="mt-8 mb-3 flex items-center gap-2.5"><span class="h-5 w-1 rounded-full bg-emerald-400 flex-shrink-0"></span><span class="text-sm font-semibold text-emerald-700">${title}</span></div>`)
      } else if (hasBad) {
        out.push(`<div class="mt-8 mb-3 flex items-center gap-2.5"><span class="h-5 w-1 rounded-full bg-rose-400 flex-shrink-0"></span><span class="text-sm font-semibold text-rose-700">${title}</span></div>`)
      } else {
        out.push(`<div class="mt-8 mb-3 flex items-center gap-2.5"><span class="h-5 w-1 rounded-full bg-blue-400 flex-shrink-0"></span><span class="text-sm font-semibold text-slate-800 dark:text-slate-200">${title}</span></div>`)
      }
      continue
    }

    if (/^### /.test(raw)) {
      closeList()
      out.push(`<h3 class="text-sm font-semibold mt-5 mb-1.5 text-slate-800 dark:text-slate-200">${line.replace(/^### /, '')}</h3>`)
      continue
    }

    if (/^> /.test(raw)) {
      closeList()
      const content = line.replace(/^&gt; |^> /, '')
      out.push(`<blockquote class="my-3 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">${content}</blockquote>`)
      continue
    }

    if (/^\d+\. /.test(raw)) {
      if (!inOl) {
        closeList()
        olContext = 'massnahmen'
        out.push('<ol class="list-none space-y-3 my-3 pl-0">')
        inOl = true
      }
      const content = line.replace(/^\d+\. /, '')
      const num = raw.match(/^(\d+)\./)?.[1] ?? '•'
      if (olContext === 'massnahmen') {
        out.push(`<li class="flex gap-3 rounded-xl border border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] px-4 py-3 hover:bg-blue-50/40 transition-colors"><span class="mt-0.5 flex-shrink-0 grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-[10px] font-bold text-white">${num}</span><span class="text-sm leading-relaxed text-slate-700 dark:text-slate-300">${content}</span></li>`)
      } else {
        out.push(`<li class="flex gap-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300"><span class="mt-0.5 flex-shrink-0 grid h-5 w-5 place-items-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-600">${num}</span><span>${content}</span></li>`)
      }
      continue
    }

    if (/^[-*] /.test(raw)) {
      if (!inUl) { closeList(); out.push('<ul class="space-y-2 my-2 pl-0 list-none">'); inUl = true }
      const content = line.replace(/^[-*] /, '')
      out.push(`<li class="flex gap-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300"><span class="mt-2 flex-shrink-0 h-1.5 w-1.5 rounded-full bg-slate-400"></span><span>${content}</span></li>`)
      continue
    }

    if (/^---+$/.test(raw.trim())) {
      closeList()
      out.push('<hr class="my-5 border-slate-100 dark:border-[#252d3a]" />')
      continue
    }

    if (!raw.trim()) {
      closeList()
      inSummarySection = false
      out.push('<div class="h-1.5"></div>')
      continue
    }

    closeList()
    if (inSummarySection) {
      out.push(`<div class="rounded-xl bg-slate-900 px-5 py-4 text-sm font-medium text-white leading-relaxed">${line}</div>`)
      inSummarySection = false
    } else {
      out.push(`<p class="text-sm leading-relaxed text-slate-600 dark:text-slate-300">${line}</p>`)
    }
  }

  flushTable()
  closeList()
  return out.join('\n')
}

// ─── KPI chip ─────────────────────────────────────────────────────────────────

function fmt(v: number | null, decimals = 2, suffix = ''): string {
  if (v === null) return '—'
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + 'M' + suffix
  if (v >= 10_000) return (v / 1_000).toFixed(1).replace('.', ',') + 'K' + suffix
  return v.toFixed(decimals).replace('.', ',') + suffix
}

const KPI_DEFS: { key: keyof KPIs; label: string; format: (v: number | null) => string }[] = [
  { key: 'spend_eur', label: 'Kosten', format: v => fmt(v, 2, ' €') },
  { key: 'impressions', label: 'Impressionen', format: v => fmt(v, 0) },
  { key: 'clicks', label: 'Klicks', format: v => fmt(v, 0) },
  { key: 'link_clicks', label: 'Link-Klicks', format: v => fmt(v, 0) },
  { key: 'reach', label: 'Reichweite', format: v => fmt(v, 0) },
  { key: 'conversions', label: 'Conversions', format: v => fmt(v, 0) },
  { key: 'ctr_pct', label: 'CTR', format: v => fmt(v, 2, '%') },
  { key: 'cpc_eur', label: 'CPC', format: v => fmt(v, 2, ' €') },
  { key: 'cpm_eur', label: 'CPM', format: v => fmt(v, 2, ' €') },
  { key: 'cpa_eur', label: 'CPA', format: v => fmt(v, 2, ' €') },
  { key: 'frequency', label: 'Frequenz', format: v => fmt(v, 2) },
  { key: 'conversion_rate_pct', label: 'Conv.-Rate', format: v => fmt(v, 2, '%') },
]

const COLUMN_LABELS: Record<string, string> = {
  campaign: 'Kampagne',
  ad_group: 'Anzeigengruppe',
  asset_group: 'Asset-Gruppe',
  ad: 'Anzeige',
  status: 'Status',
  impressions: 'Impressions',
  clicks: 'Klicks',
  link_clicks: 'Link-Klicks',
  spend: 'Kosten',
  spend_eur: 'Kosten',
  reach: 'Reichweite',
  frequency: 'Frequenz',
  conversions: 'Conversions',
  ctr: 'CTR',
  cpc: 'CPC',
  conversion_rate: 'Conversion Rate',
  cost_per_conversion: 'Kosten/Conv.',
  roas: 'ROAS',
  page_interactions: 'Seiteninteraktionen',
  likes: 'Likes',
  follows: 'Follows',
  post_comments: 'Kommentare',
  post_interactions: 'Beitragsinteraktionen',
  post_reactions: 'Reaktionen',
  saved_posts: 'Gespeichert',
  shared_posts: 'Geteilt',
}

function colLabel(key: string): string {
  return COLUMN_LABELS[key] ?? key
}

function KpiChip({ kpiDef, value }: { kpiDef: typeof KPI_DEFS[number]; value: number | null }) {
  if (value === null) return null
  return (
    <div className="flex flex-col items-center rounded-xl border border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] px-3 py-2 min-w-[80px]">
      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{kpiDef.label}</span>
      <span className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{kpiDef.format(value)}</span>
    </div>
  )
}

// ─── Client label input ───────────────────────────────────────────────────────

function ClientLabelInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-[#1e2635]">
            <User className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Kundenname <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span>
            </label>
            <input
              type="text"
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder="z.B. Müller GmbH"
              className="w-full rounded-lg border border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({
  file,
  onFile,
  onClear,
  label,
  disabled,
}: {
  file: File | null
  onFile: (f: File) => void
  onClear: () => void
  label?: string
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.endsWith('.csv')) onFile(f)
  }, [onFile])

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onFile(f)
    e.target.value = ''
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] px-4 py-3">
        <FileText className="h-5 w-5 flex-shrink-0 text-blue-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{file.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
        </div>
        <button
          onClick={onClear}
          className="flex-shrink-0 rounded-md p-1 text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-[#252d3a] hover:text-slate-600 dark:hover:text-slate-300"
          aria-label="Datei entfernen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-colors',
        dragging
          ? 'border-blue-300 bg-blue-50'
          : 'border-slate-200 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] hover:border-blue-200 hover:bg-blue-50/40',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <Upload className="h-7 w-7 text-slate-400 dark:text-slate-500" />
      <div className="text-center">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label ?? 'CSV-Datei hochladen'}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Drag & Drop oder klicken — nur .csv</p>
      </div>
      <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={handleChange} />
    </div>
  )
}

// ─── Preview card ─────────────────────────────────────────────────────────────

function PreviewCard({ preview }: { preview: PreviewResult }) {
  const visibleKpis = KPI_DEFS.filter(d => preview.kpis[d.key] !== null)

  return (
    <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-sm text-slate-800 dark:text-slate-200">Datei erkannt</CardTitle>
          <Badge variant="default" className="rounded-full text-xs">{preview.platform}</Badge>
          {preview.date_range && (
            <Badge variant="outline" className="rounded-full text-xs font-normal text-slate-600 dark:text-slate-300">
              {preview.date_range.from} – {preview.date_range.to}
            </Badge>
          )}
          <Badge variant="outline" className="rounded-full text-xs font-normal text-slate-600 dark:text-slate-300 ml-auto">
            {preview.rows_filtered} Zeilen · {preview.analysis_level}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {visibleKpis.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {visibleKpis.map(d => (
              <KpiChip key={d.key} kpiDef={d} value={preview.kpis[d.key]} />
            ))}
          </div>
        )}

        {preview.rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-[#252d3a]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28]">
                  {preview.columns.slice(0, 7).map(col => (
                    <th key={col} className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400">{colLabel(col)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className={cn('border-b border-slate-100 dark:border-[#252d3a]/60', i % 2 === 0 && 'bg-slate-50 dark:bg-[#151c28]/40')}>
                    {preview.columns.slice(0, 7).map(col => (
                      <td key={col} className="px-3 py-2 text-slate-600 dark:text-slate-300">
                        {row[col] === null || row[col] === undefined ? '—' : String(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Filter panel ─────────────────────────────────────────────────────────────

function FilterPanel({
  preview,
  activeOnly,
  onActiveOnly,
  selected,
  onSelected,
}: {
  preview: PreviewResult
  activeOnly: boolean
  onActiveOnly: (v: boolean) => void
  selected: string[]
  onSelected: (v: string[]) => void
}) {
  if (!preview.has_status && preview.campaigns_total <= 1) return null

  const toggle = (name: string) => {
    onSelected(selected.includes(name) ? selected.filter(s => s !== name) : [...selected, name])
  }

  const allSelected = selected.length === 0

  return (
    <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-800 dark:text-slate-200">Filter</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {preview.has_status && (
          <label className="flex cursor-pointer items-center gap-2.5">
            <div
              onClick={() => onActiveOnly(!activeOnly)}
              className={cn(
                'relative h-5 w-9 rounded-full border transition-colors',
                activeOnly ? 'border-blue-500 bg-blue-500' : 'border-slate-200 dark:border-[#252d3a] bg-slate-100 dark:bg-[#1e2635]',
              )}
            >
              <div className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white dark:bg-[#151c28] shadow transition-transform',
                activeOnly ? 'translate-x-4' : 'translate-x-0.5',
              )} />
            </div>
            <span className="text-sm text-slate-700 dark:text-slate-300">Nur aktive {preview.entity_label}n</span>
          </label>
        )}

        {preview.campaigns_total > 1 && (
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">{preview.entity_label}n auswählen</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => onSelected([])}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
                  allSelected
                    ? 'border-blue-200 bg-blue-50 text-blue-600'
                    : 'border-slate-200 dark:border-[#252d3a] text-slate-500 dark:text-slate-400 hover:border-blue-200 hover:bg-blue-50/40',
                )}
              >
                Alle
              </button>
              {preview.campaigns_all.map(name => (
                <button
                  key={name}
                  onClick={() => toggle(name)}
                  className={cn(
                    'max-w-[200px] truncate rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
                    selected.includes(name)
                      ? 'border-blue-200 bg-blue-50 text-blue-600'
                      : 'border-slate-200 dark:border-[#252d3a] text-slate-500 dark:text-slate-400 hover:border-blue-200 hover:bg-blue-50/40',
                  )}
                  title={name}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Analysis result ──────────────────────────────────────────────────────────

function AnalysisResult({ result, onReset }: { result: AnalyzeResult; onReset: () => void }) {
  const bodyText = result.analysis.replace(/^# .+\n?/, '').trimStart()
  const html = renderMarkdown(bodyText)
  const visibleKpis = KPI_DEFS.filter(d => result.meta.kpis[d.key] !== null)

  return (
    <div className="space-y-4 print-area">
      {/* Print header — nur beim Drucken sichtbar */}
      <div className="hidden print:block mb-6 pb-4 border-b border-slate-200 dark:border-[#252d3a]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">KI Performance-Analyse</p>
            {result.client_label && (
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{result.client_label}</p>
            )}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft overflow-hidden">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-[#252d3a] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 no-print">
              <BarChart3 className="h-4.5 w-4.5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">KI-Analyse</span>
                <Badge variant="default" className="rounded-full text-xs">{result.meta.platform}</Badge>
                {result.meta.date_range && (
                  <Badge variant="outline" className="rounded-full text-xs font-normal text-slate-500 dark:text-slate-400">
                    {result.meta.date_range.from} – {result.meta.date_range.to}
                  </Badge>
                )}
                {result.client_label && (
                  <Badge variant="outline" className="rounded-full text-xs font-normal text-slate-500 dark:text-slate-400 gap-1">
                    <User className="h-3 w-3" />
                    {result.client_label}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{result.meta.rows} Zeilen · {result.meta.analysis_level}</p>
            </div>
          </div>
          <div className="flex gap-2 no-print">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs rounded-full" onClick={() => window.print()}>
              <FileDown className="h-3.5 w-3.5" />
              Als PDF exportieren
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs rounded-full" onClick={onReset}>
              <RefreshCw className="h-3.5 w-3.5" />
              Neue Analyse
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        {visibleKpis.length > 0 && (
          <div className="kpi-strip grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 dark:border-[#252d3a] sm:grid-cols-4 lg:grid-cols-6">
            {visibleKpis.slice(0, 6).map(d => (
              <div key={d.key} className="flex flex-col items-center px-4 py-3">
                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{d.label}</span>
                <span className="mt-0.5 text-base font-bold text-slate-900 dark:text-slate-100">{d.format(result.meta.kpis[d.key])}</span>
              </div>
            ))}
          </div>
        )}

        {/* Analysis body */}
        <CardContent className="px-6 py-6">
          <div className="max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Compare result ───────────────────────────────────────────────────────────

function DeltaBadge({ diff, pct }: { diff: number | null; pct: number | null }) {
  if (diff === null) return <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>
  const good = diff >= 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', good ? 'text-emerald-600' : 'text-rose-600')}>
      {good ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {diff > 0 ? '+' : ''}{diff.toFixed(2)}
      {pct !== null && <span className="text-[10px] opacity-75">({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)</span>}
    </span>
  )
}

function CompareResultView({ result, onReset }: { result: CompareResult; onReset: () => void }) {
  const html = renderMarkdown(result.analysis)
  const shownKpis = KPI_DEFS.filter(d => result.meta.a.kpis[d.key] !== null || result.meta.b.kpis[d.key] !== null)

  return (
    <div className="space-y-4 print-area">
      {/* Print header */}
      <div className="hidden print:block mb-6 pb-4 border-b border-slate-200 dark:border-[#252d3a]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">KI Zeitraum-Vergleich</p>
            {result.client_label && (
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{result.client_label}</p>
            )}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-sm text-slate-800 dark:text-slate-200">KPI-Vergleich</CardTitle>
            <Badge variant="default" className="rounded-full text-xs">{result.meta.platform}</Badge>
            {result.client_label && (
              <Badge variant="outline" className="rounded-full text-xs font-normal text-slate-500 dark:text-slate-400 gap-1">
                <User className="h-3 w-3" />
                {result.client_label}
              </Badge>
            )}
            <div className="ml-auto flex gap-2 no-print">
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs rounded-full" onClick={() => window.print()}>
                <FileDown className="h-3.5 w-3.5" />
                Als PDF exportieren
              </Button>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs rounded-full" onClick={onReset}>
                <RefreshCw className="h-3.5 w-3.5" />
                Neuer Vergleich
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#252d3a]">
                  <th className="py-2 pr-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400">KPI</th>
                  <th className="py-2 px-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">{result.meta.a.label}</th>
                  <th className="py-2 px-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">{result.meta.b.label}</th>
                  <th className="py-2 pl-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Δ</th>
                </tr>
              </thead>
              <tbody>
                {shownKpis.map(d => {
                  const delta = result.meta.deltas[d.key]
                  return (
                    <tr key={d.key} className="border-b border-slate-100 dark:border-[#252d3a]/60">
                      <td className="py-2 pr-4 text-xs text-slate-500 dark:text-slate-400">{d.label}</td>
                      <td className="py-2 px-3 text-right text-xs tabular-nums text-slate-700 dark:text-slate-300">{d.format(result.meta.a.kpis[d.key])}</td>
                      <td className="py-2 px-3 text-right text-xs tabular-nums text-slate-700 dark:text-slate-300">{d.format(result.meta.b.kpis[d.key])}</td>
                      <td className="py-2 pl-3 text-right">
                        {delta ? <DeltaBadge diff={delta.diff} pct={delta.pct} /> : <span className="text-xs text-slate-400 dark:text-slate-500">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-slate-800 dark:text-slate-200">KI-Analyse</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Analyse tab ──────────────────────────────────────────────────────────────

function AnalyseTab() {
  const { activeCustomer } = useActiveCustomer()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [activeOnly, setActiveOnly] = useState(false)
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([])
  const [clientLabel, setClientLabel] = useState('')
  const [result, setResult] = useState<AnalyzeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setPreview(null)
    setResult(null)
    setError(null)
    setActiveOnly(false)
    setSelectedCampaigns([])
    setPreviewLoading(true)

    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/tenant/performance/preview', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Fehler beim Laden der Vorschau')
      setPreview(data.preview)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  const handleClear = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
  }

  const handleAnalyze = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('filters', JSON.stringify({ active_only: activeOnly, campaigns: selectedCampaigns }))
      fd.append('client_label', clientLabel)
      if (activeCustomer) fd.append('customer_id', activeCustomer.id)
      const res = await fetch('/api/tenant/performance/analyze', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Analyse fehlgeschlagen')
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }

  if (result) return (
    <AnalysisResult
      result={result}
      onReset={() => { setResult(null); setFile(null); setPreview(null); setClientLabel('') }}
    />
  )

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
        <CardHeader>
          <CardTitle className="text-sm text-slate-800 dark:text-slate-200">CSV-Datei hochladen</CardTitle>
        </CardHeader>
        <CardContent>
          <DropZone file={file} onFile={handleFile} onClear={handleClear} />
          {previewLoading && (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Datei wird analysiert…
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      )}

      {preview && (
        <>
          <PreviewCard preview={preview} />

          <FilterPanel
            preview={preview}
            activeOnly={activeOnly}
            onActiveOnly={setActiveOnly}
            selected={selectedCampaigns}
            onSelected={setSelectedCampaigns}
          />

          <ClientLabelInput value={clientLabel} onChange={setClientLabel} />

          <Button
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full gap-2 rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                KI analysiert Daten…
              </>
            ) : (
              <>
                <BarChart3 className="h-4 w-4" />
                KI-Analyse starten
              </>
            )}
          </Button>
        </>
      )}
    </div>
  )
}

// ─── Vergleich tab ────────────────────────────────────────────────────────────

function VergleichTab() {
  const { activeCustomer } = useActiveCustomer()
  const [fileA, setFileA] = useState<File | null>(null)
  const [fileB, setFileB] = useState<File | null>(null)
  const [labelA, setLabelA] = useState('')
  const [labelB, setLabelB] = useState('')
  const [clientLabel, setClientLabel] = useState('')
  const [previewA, setPreviewA] = useState<PreviewResult | null>(null)
  const [previewB, setPreviewB] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CompareResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadPreview = useCallback(async (f: File, side: 'a' | 'b') => {
    const fd = new FormData()
    fd.append('file', f)
    try {
      const res = await fetch('/api/tenant/performance/preview', { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) {
        if (side === 'a') setPreviewA(data.preview)
        else setPreviewB(data.preview)
      }
    } catch { /* swallow preview errors */ }
  }, [])

  const handleFileA = useCallback((f: File) => {
    setFileA(f); setPreviewA(null); setResult(null); loadPreview(f, 'a')
  }, [loadPreview])

  const handleFileB = useCallback((f: File) => {
    setFileB(f); setPreviewB(null); setResult(null); loadPreview(f, 'b')
  }, [loadPreview])

  const handleCompare = async () => {
    if (!fileA || !fileB) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('fileA', fileA)
      fd.append('fileB', fileB)
      fd.append('labelA', labelA || 'Zeitraum A')
      fd.append('labelB', labelB || 'Zeitraum B')
      fd.append('client_label', clientLabel)
      if (activeCustomer) fd.append('customer_id', activeCustomer.id)
      const res = await fetch('/api/tenant/performance/compare', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Vergleich fehlgeschlagen')
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFileA(null); setFileB(null); setPreviewA(null); setPreviewB(null)
    setResult(null); setError(null); setLabelA(''); setLabelB(''); setClientLabel('')
  }

  if (result) return <CompareResultView result={result} onReset={handleReset} />

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-800 dark:text-slate-200">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-600">A</span>
              Zeitraum A
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="text"
              placeholder="z.B. Januar 2024"
              value={labelA}
              onChange={e => setLabelA(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <DropZone file={fileA} onFile={handleFileA} onClear={() => { setFileA(null); setPreviewA(null) }} label="Zeitraum A hochladen" />
            {previewA && (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="default" className="rounded-full text-xs">{previewA.platform}</Badge>
                {previewA.date_range && (
                  <Badge variant="outline" className="rounded-full text-xs font-normal">{previewA.date_range.from} – {previewA.date_range.to}</Badge>
                )}
                <Badge variant="outline" className="rounded-full text-xs font-normal">{previewA.rows_filtered} Zeilen</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-800 dark:text-slate-200">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-100 dark:bg-[#1e2635] text-[10px] font-bold text-slate-600 dark:text-slate-300">B</span>
              Zeitraum B
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="text"
              placeholder="z.B. Februar 2024"
              value={labelB}
              onChange={e => setLabelB(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <DropZone file={fileB} onFile={handleFileB} onClear={() => { setFileB(null); setPreviewB(null) }} label="Zeitraum B hochladen" />
            {previewB && (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="default" className="rounded-full text-xs">{previewB.platform}</Badge>
                {previewB.date_range && (
                  <Badge variant="outline" className="rounded-full text-xs font-normal">{previewB.date_range.from} – {previewB.date_range.to}</Badge>
                )}
                <Badge variant="outline" className="rounded-full text-xs font-normal">{previewB.rows_filtered} Zeilen</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {previewA && previewB && (
        <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-800 dark:text-slate-200">KPI-Vorschau</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-[#252d3a]">
                    <th className="py-2 pr-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400">KPI</th>
                    <th className="py-2 px-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">{labelA || 'Zeitraum A'}</th>
                    <th className="py-2 pl-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">{labelB || 'Zeitraum B'}</th>
                  </tr>
                </thead>
                <tbody>
                  {KPI_DEFS.filter(d => previewA.kpis[d.key] !== null || previewB.kpis[d.key] !== null).map(d => (
                    <tr key={d.key} className="border-b border-slate-100 dark:border-[#252d3a]/60">
                      <td className="py-1.5 pr-4 text-xs text-slate-500 dark:text-slate-400">{d.label}</td>
                      <td className="py-1.5 px-3 text-right text-xs tabular-nums text-slate-700 dark:text-slate-300">{d.format(previewA.kpis[d.key])}</td>
                      <td className="py-1.5 pl-3 text-right text-xs tabular-nums text-slate-700 dark:text-slate-300">{d.format(previewB.kpis[d.key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <ClientLabelInput value={clientLabel} onChange={setClientLabel} />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      )}

      <Button
        onClick={handleCompare}
        disabled={!fileA || !fileB || loading}
        className="w-full gap-2 rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            KI vergleicht Zeiträume…
          </>
        ) : (
          <>
            <BarChart3 className="h-4 w-4" />
            Zeiträume vergleichen
          </>
        )}
      </Button>
    </div>
  )
}

// ─── Verlauf tab ──────────────────────────────────────────────────────────────

function VerlaufTab() {
  const { activeCustomer } = useActiveCustomer()
  const [analyses, setAnalyses] = useState<PerformanceAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openItem, setOpenItem] = useState<(AnalyzeResult | CompareResult) | null>(null)
  const [openLoading, setOpenLoading] = useState(false)
  const analysesCacheKey = `ai-performance:history:${activeCustomer?.id ?? 'all'}`

  useEffect(() => {
    const cachedAnalyses = readSessionCache<PerformanceAnalysis[]>(analysesCacheKey)
    if (cachedAnalyses) {
      setAnalyses(cachedAnalyses)
      setLoading(false)
    }

    const url = activeCustomer
      ? `/api/tenant/performance/history?customer_id=${activeCustomer.id}`
      : '/api/tenant/performance/history'
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setAnalyses(d.analyses ?? [])
        writeSessionCache(analysesCacheKey, d.analyses ?? [])
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler beim Laden'))
      .finally(() => setLoading(false))
  }, [activeCustomer, analysesCacheKey])

  const handleOpen = async (id: string) => {
    setOpenLoading(true)
    try {
      const res = await fetch(`/api/tenant/performance/history/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Fehler beim Laden')
      setOpenItem(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setOpenLoading(false)
    }
  }

  if (openItem) {
    const isCompare = 'meta' in openItem && 'compare' in (openItem.meta as Record<string, unknown>)
    if (isCompare) {
      return (
        <div className="space-y-3">
          <button
            onClick={() => setOpenItem(null)}
            className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Zurück zum Verlauf
          </button>
          <CompareResultView result={openItem as CompareResult} onReset={() => setOpenItem(null)} />
        </div>
      )
    }
    return (
      <div className="space-y-3">
        <button
          onClick={() => setOpenItem(null)}
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Zurück zum Verlauf
        </button>
        <AnalysisResult result={openItem as AnalyzeResult} onReset={() => setOpenItem(null)} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verlauf wird geladen…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
    )
  }

  if (analyses.length === 0) {
    return (
      <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 dark:bg-[#151c28]">
            <History className="h-5 w-5 text-slate-400 dark:text-slate-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Noch keine Analysen gespeichert</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Starte eine Analyse im Tab &bdquo;Analyse&ldquo; oder &bdquo;Vergleich&ldquo;.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {openLoading && (
        <div className="flex items-center gap-2 pb-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Wird geladen…
        </div>
      )}
      {analyses.map(item => {
        const meta = item.meta as Record<string, unknown>
        const isCompare = item.type === 'compare'
        const dateRange = isCompare
          ? (meta.a as { date_range?: { from: string; to: string } } | undefined)?.date_range
          : (meta as { date_range?: { from: string; to: string } }).date_range
        const analysisLevel = isCompare ? null : (meta.analysis_level as string | null)

        return (
          <Card key={item.id} className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
            <CardContent className="flex items-center gap-4 py-3 px-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <Badge variant={isCompare ? 'outline' : 'default'} className="rounded-full text-[10px] px-2 py-0">
                    {isCompare ? 'Vergleich' : 'Analyse'}
                  </Badge>
                  {item.platform && (
                    <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0 text-slate-500 dark:text-slate-400">
                      {item.platform}
                    </Badge>
                  )}
                  {analysisLevel && (
                    <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0 text-slate-400 dark:text-slate-500 font-normal">
                      {analysisLevel}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                  {item.client_label && (
                    <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                      <User className="h-3 w-3" />
                      {item.client_label}
                    </span>
                  )}
                  {dateRange && (
                    <span>{dateRange.from} – {dateRange.to}</span>
                  )}
                  <span className="text-slate-400 dark:text-slate-500">
                    {new Date(item.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs rounded-full flex-shrink-0"
                onClick={() => handleOpen(item.id)}
                disabled={openLoading}
              >
                Öffnen
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AiPerformanceWorkspace() {
  const [activeTab, setActiveTab] = useState<'analyse' | 'vergleich' | 'verlauf'>('analyse')
  const [mountedTabs, setMountedTabs] = useState<Array<'analyse' | 'vergleich' | 'verlauf'>>(['analyse'])
  const handleTabChange = useCallback((value: string) => {
    const nextTab = value as 'analyse' | 'vergleich' | 'verlauf'
    setActiveTab(nextTab)
    setMountedTabs((prev) => (prev.includes(nextTab) ? prev : [...prev, nextTab]))
  }, [])

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList className="mb-4 rounded-full bg-slate-100 dark:bg-[#1e2635]">
        <TabsTrigger value="analyse" className="gap-1.5 rounded-full">
          <BarChart3 className="h-3.5 w-3.5" />
          Analyse
        </TabsTrigger>
        <TabsTrigger value="vergleich" className="gap-1.5 rounded-full">
          <TrendingUp className="h-3.5 w-3.5" />
          Vergleich
        </TabsTrigger>
        <TabsTrigger value="verlauf" className="gap-1.5 rounded-full">
          <History className="h-3.5 w-3.5" />
          Verlauf
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="analyse"
        {...(mountedTabs.includes('analyse') ? { forceMount: true as const } : {})}
        className="data-[state=inactive]:hidden"
      >
        <AnalyseTab />
      </TabsContent>

      <TabsContent
        value="vergleich"
        {...(mountedTabs.includes('vergleich') ? { forceMount: true as const } : {})}
        className="data-[state=inactive]:hidden"
      >
        <VergleichTab />
      </TabsContent>

      <TabsContent
        value="verlauf"
        {...(mountedTabs.includes('verlauf') ? { forceMount: true as const } : {})}
        className="data-[state=inactive]:hidden"
      >
        <VerlaufTab />
      </TabsContent>
    </Tabs>
  )
}
