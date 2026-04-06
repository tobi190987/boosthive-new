'use client'

import {
  ChevronRight,
  Megaphone,
  Search,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { ApprovalStatusBadge } from '@/components/approval-status-badge'
import { AD_PLATFORMS, AD_PLATFORMS_MAP, type PlatformId } from '@/lib/ad-limits'
import type { GenerationSummary } from './types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function platformLabel(id: PlatformId): string {
  return AD_PLATFORMS_MAP[id]?.label ?? id
}

// ─── History View ────────────────────────────────────────────────────────────

export interface HistoryViewProps {
  history: GenerationSummary[]
  loading: boolean
  customers: { id: string; name: string }[]
  filterCustomer: string
  setFilterCustomer: (id: string) => void
  filterPlatform: PlatformId | 'all'
  setFilterPlatform: (p: PlatformId | 'all') => void
  search: string
  setSearch: (s: string) => void
  filterDate: 'all' | '7d' | '30d' | '90d'
  setFilterDate: (d: 'all' | '7d' | '30d' | '90d') => void
  onOpen: (id: string) => void
  onNew: () => void
}

export function HistoryView({
  history,
  loading,
  customers,
  filterCustomer,
  setFilterCustomer,
  filterPlatform,
  setFilterPlatform,
  search,
  setSearch,
  filterDate,
  setFilterDate,
  onOpen,
  onNew,
}: HistoryViewProps) {
  const filtered = history
    .filter((item) => !search || item.product.toLowerCase().includes(search.toLowerCase()))
    .filter((item) => {
      if (filterDate === 'all') return true
      const days = filterDate === '7d' ? 7 : filterDate === '30d' ? 30 : 90
      return new Date(item.created_at) >= new Date(Date.now() - days * 86_400_000)
    })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
                Suche
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Produkt suchen..."
                  className="rounded-xl pl-8"
                />
              </div>
            </div>
            <div className="flex-1">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
                Kunde
              </Label>
              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Alle Kunden" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Kunden</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
                Plattform
              </Label>
              <Select value={filterPlatform} onValueChange={(v) => setFilterPlatform(v as PlatformId | 'all')}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Alle Plattformen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Plattformen</SelectItem>
                  {AD_PLATFORMS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
                Zeitraum
              </Label>
              <Select value={filterDate} onValueChange={(v) => setFilterDate(v as 'all' | '7d' | '30d' | '90d')}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="7d">Letzte 7 Tage</SelectItem>
                  <SelectItem value="30d">Letzte 30 Tage</SelectItem>
                  <SelectItem value="90d">Letzte 90 Tage</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {/* No results (filters active) */}
      {!loading && history.length > 0 && filtered.length === 0 && (
        <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Keine Generierungen für diese Filtereinstellungen gefunden.
        </div>
      )}

      {/* Empty state */}
      {!loading && history.length === 0 && (
        <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
          <CardContent className="flex flex-col items-center gap-5 p-8 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800">
              <Megaphone className="h-7 w-7 text-slate-400 dark:text-slate-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Noch keine Generierungen
              </h2>
              <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
                Erstelle deine erste KI-generierte Anzeige. Wähle Plattformen, gib ein Briefing ein und erhalte sofort optimierte Ad-Texte.
              </p>
            </div>
            <Button
              className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827] dark:bg-blue-600 dark:hover:bg-blue-700"
              onClick={onNew}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Erste Generierung starten
            </Button>
          </CardContent>
        </Card>
      )}

      {/* History list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item.id)}
              className="w-full text-left rounded-2xl border border-slate-100 bg-white p-4 sm:p-5 transition-all hover:border-slate-200 hover:shadow-sm dark:border-[#252d3a] dark:bg-[#151c28] dark:hover:border-[#3d4a5c]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-50 truncate">
                    {item.product}
                  </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.platforms.map((pid) => (
                      <Badge key={pid} variant="secondary" className="rounded-full text-[10px] px-2 py-0.5">
                        {platformLabel(pid)}
                      </Badge>
                    ))}
                    {item.customer_name && (
                      <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0.5">
                        {item.customer_name}
                      </Badge>
                    )}
                    {item.approval_status !== 'draft' && (
                      <ApprovalStatusBadge status={item.approval_status} />
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(item.created_at)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
