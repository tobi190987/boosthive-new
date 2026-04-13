'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgeEuro,
  BarChart3,
  CalendarDays,
  Info,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { InlineConfirm } from '@/components/inline-confirm'
import { CustomerSelectorDropdown } from '@/components/customer-selector-dropdown'
import { useToast } from '@/hooks/use-toast'
import { useActiveCustomer } from '@/lib/active-customer-context'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type Platform = 'google_ads' | 'meta_ads' | 'tiktok_ads'
type SpendSource = 'manual' | 'api_google' | 'api_meta' | 'api_tiktok'

interface Budget {
  id: string
  customer_id: string
  customer_name: string
  platform: Platform
  label: string | null
  budget_month: string // YYYY-MM-01
  planned_amount: number
  currency: string
  alert_threshold_percent: number
  campaign_ids: string[] | null
  spent_amount: number
  spent_source: 'api' | 'manual' | 'mixed'
  cpc: number | null
  cpm: number | null
  roas: number | null
  has_integration: boolean
  last_synced_at: string | null
}

interface DailySpendPoint {
  date: string
  amount: number
  source: SpendSource
}

interface BudgetsResponse {
  budgets?: Budget[]
  hasAnyIntegration?: boolean
}

interface DailySpendResponse {
  entries?: DailySpendPoint[]
}

interface BudgetWorkspaceProps {
  isAdmin: boolean
}

// ─── Static config ───────────────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<
  Platform,
  { label: string; shortLabel: string; iconBg: string; iconText: string; accent: string }
> = {
  google_ads: {
    label: 'Google Ads',
    shortLabel: 'Google',
    iconBg: 'bg-blue-50 dark:bg-blue-950/40',
    iconText: 'text-blue-600 dark:text-blue-400',
    accent: '#2563eb',
  },
  meta_ads: {
    label: 'Meta Ads',
    shortLabel: 'Meta',
    iconBg: 'bg-sky-50 dark:bg-sky-950/40',
    iconText: 'text-sky-600 dark:text-sky-400',
    accent: '#0ea5e9',
  },
  tiktok_ads: {
    label: 'TikTok Ads',
    shortLabel: 'TikTok',
    iconBg: 'bg-rose-50 dark:bg-rose-950/40',
    iconText: 'text-rose-600 dark:text-rose-400',
    accent: '#f43f5e',
  },
}

const MONTH_LABELS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatCurrencyPrecise(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function parseMonthKey(key: string): { year: number; month: number } {
  const [year, month] = key.split('-').map(Number)
  return { year, month }
}

function monthLabel(key: string): string {
  const { year, month } = parseMonthKey(key)
  return `${MONTH_LABELS[month - 1]} ${year}`
}

function daysInMonth(key: string): number {
  const { year, month } = parseMonthKey(key)
  return new Date(year, month, 0).getDate()
}

function currentDayOfMonth(key: string): number {
  const now = new Date()
  const { year, month } = parseMonthKey(key)
  if (now.getFullYear() !== year || now.getMonth() + 1 !== month) {
    if (
      now.getFullYear() > year ||
      (now.getFullYear() === year && now.getMonth() + 1 > month)
    ) {
      return daysInMonth(key)
    }
    return 0
  }
  return now.getDate()
}

function buildMonthOptions(): string[] {
  const options: string[] = []
  const now = new Date()
  // 6 vergangene Monate + aktueller + 1 zukünftiger
  for (let offset = -6; offset <= 1; offset += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    options.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    )
  }
  return options.reverse()
}

function isPastMonth(key: string): boolean {
  const { year, month } = parseMonthKey(key)
  const now = new Date()
  if (year < now.getFullYear()) return true
  if (year === now.getFullYear() && month < now.getMonth() + 1) return true
  return false
}

function getSpendStatus(percent: number): {
  tone: 'ok' | 'warning' | 'danger' | 'critical'
  progressColor: string
  cardBorder: string
} {
  if (percent >= 150) {
    return {
      tone: 'critical',
      progressColor: 'bg-red-700 dark:bg-red-600',
      cardBorder:
        'border-red-300 bg-red-50/60 dark:border-red-900/70 dark:bg-red-950/20',
    }
  }
  if (percent >= 100) {
    return {
      tone: 'danger',
      progressColor: 'bg-red-500 dark:bg-red-500',
      cardBorder:
        'border-red-200 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/10',
    }
  }
  if (percent >= 80) {
    return {
      tone: 'warning',
      progressColor: 'bg-orange-500 dark:bg-orange-400',
      cardBorder:
        'border-orange-200 bg-orange-50/40 dark:border-orange-900/60 dark:bg-orange-950/10',
    }
  }
  return {
    tone: 'ok',
    progressColor: 'bg-emerald-500 dark:bg-emerald-400',
    cardBorder:
      'border-slate-100 bg-white dark:border-border dark:bg-card',
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BudgetWorkspace({ isAdmin }: BudgetWorkspaceProps) {
  const { toast } = useToast()
  const { activeCustomer, customers } = useActiveCustomer()
  const monthOptions = useMemo(() => buildMonthOptions(), [])
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey())

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasAnyIntegration, setHasAnyIntegration] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const lastSyncedAt = useMemo(() => {
    const dates = budgets.map((b) => b.last_synced_at).filter(Boolean) as string[]
    if (dates.length === 0) return null
    return dates.reduce((latest, d) => (d > latest ? d : latest))
  }, [budgets])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [detailBudget, setDetailBudget] = useState<Budget | null>(null)

  const filteredBudgets = useMemo(() => {
    if (!activeCustomer) return budgets
    return budgets.filter((b) => b.customer_id === activeCustomer.id)
  }, [budgets, activeCustomer])

  const summary = useMemo(() => {
    const totalPlanned = filteredBudgets.reduce(
      (acc, b) => acc + b.planned_amount,
      0
    )
    const totalSpent = filteredBudgets.reduce(
      (acc, b) => acc + b.spent_amount,
      0
    )
    const percent = totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0
    const overBudgetCount = filteredBudgets.filter(
      (b) => b.planned_amount > 0 && b.spent_amount / b.planned_amount > 1
    ).length
    return { totalPlanned, totalSpent, percent, overBudgetCount }
  }, [filteredBudgets])

  const groupedByCustomer = useMemo(() => {
    const groups = new Map<string, { name: string; items: Budget[] }>()
    for (const b of filteredBudgets) {
      const existing = groups.get(b.customer_id)
      if (existing) {
        existing.items.push(b)
      } else {
        groups.set(b.customer_id, { name: b.customer_name, items: [b] })
      }
    }
    return Array.from(groups.entries()).map(([id, group]) => ({ id, ...group }))
  }, [filteredBudgets])

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadBudgets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('month', selectedMonth.substring(0, 7))
      if (activeCustomer) params.set('customer_id', activeCustomer.id)

      const res = await fetch(`/api/tenant/budgets?${params.toString()}`, {
        credentials: 'include',
      })
      if (!res.ok) {
        throw new Error(`API-Fehler (${res.status})`)
      }
      const data = (await res.json()) as BudgetsResponse
      setBudgets(data.budgets ?? [])
      setHasAnyIntegration(data.hasAnyIntegration ?? false)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unbekannter Fehler beim Laden.'
      setError(message)
      setBudgets([])
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, activeCustomer])

  useEffect(() => {
    void loadBudgets()
  }, [loadBudgets])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/tenant/budgets/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth.substring(0, 7) }),
      })
      if (!res.ok) throw new Error(`Sync fehlgeschlagen (${res.status})`)
      toast({
        title: 'Spend-Daten aktualisiert',
        description: 'Aktuelle Werte aus Google, Meta und TikTok wurden geladen.',
      })
      await loadBudgets()
    } catch (err) {
      toast({
        title: 'Sync fehlgeschlagen',
        description:
          err instanceof Error ? err.message : 'Bitte später erneut versuchen.',
        variant: 'destructive',
      })
    } finally {
      setSyncing(false)
    }
  }, [loadBudgets, selectedMonth, toast])

  const handleDelete = useCallback(
    async (budget: Budget) => {
      try {
        const res = await fetch(`/api/tenant/budgets/${budget.id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!res.ok) throw new Error(`Löschen fehlgeschlagen (${res.status})`)
        toast({ title: 'Budget gelöscht' })
        setBudgets((prev) => prev.filter((b) => b.id !== budget.id))
      } catch (err) {
        toast({
          title: 'Fehler beim Löschen',
          description:
            err instanceof Error ? err.message : 'Bitte später erneut versuchen.',
          variant: 'destructive',
        })
      }
    },
    [toast]
  )

  const handleFormSaved = useCallback(
    (saved: Budget) => {
      setBudgets((prev) => {
        const existingIndex = prev.findIndex((b) => b.id === saved.id)
        if (existingIndex >= 0) {
          const copy = [...prev]
          copy[existingIndex] = saved
          return copy
        }
        return [...prev, saved]
      })
      setDialogOpen(false)
      setEditingBudget(null)
    },
    []
  )

  const pastMonth = isPastMonth(selectedMonth)

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Filter-Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <CustomerSelectorDropdown
          className="mx-0 my-0 w-[220px]"
          triggerClassName="mx-0 my-0 w-[220px]"
          compact
        />

        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="h-10 w-56 rounded-xl">
            <CalendarDays className="mr-2 h-4 w-4 text-slate-400" />
            <SelectValue placeholder="Monat auswählen" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((key) => (
              <SelectItem key={key} value={key}>
                {monthLabel(key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {lastSyncedAt && !loading && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Zuletzt aktualisiert:{' '}
              {new Intl.DateTimeFormat('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(lastSyncedAt))}{' '}
              Uhr
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing || loading}
            className="rounded-xl"
          >
            {syncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Spend synchronisieren
          </Button>
          {isAdmin && !pastMonth && (
            <Button
              size="sm"
              variant="dark"
              onClick={() => {
                setEditingBudget(null)
                setDialogOpen(true)
              }}
              className="rounded-xl"
            >
              <Plus className="mr-2 h-4 w-4" />
              Budget anlegen
            </Button>
          )}
        </div>
      </div>

      {/* Banner: Vergangener Monat */}
      {pastMonth && (
        <Alert className="rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40">
          <Info className="h-4 w-4" />
          <AlertTitle>Vergangener Monat</AlertTitle>
          <AlertDescription>
            Du siehst historische Budget-Daten. Änderungen sind in vergangenen Monaten nicht möglich.
          </AlertDescription>
        </Alert>
      )}

      {/* Banner: Keine Ads-Integration */}
      {!hasAnyIntegration && !loading && (
        <Alert className="rounded-2xl border-blue-200 bg-blue-50/60 dark:border-blue-900/60 dark:bg-blue-950/20">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertTitle>Keine Ads-Plattform verbunden</AlertTitle>
          <AlertDescription>
            Verbinde Google Ads, Meta Ads oder TikTok Ads in den Integrationen, um Spend-Daten automatisch zu
            erfassen. Bis dahin kannst du Ausgaben manuell eintragen.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary-Bar */}
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Geplantes Budget"
          value={formatCurrency(summary.totalPlanned)}
          description={`${filteredBudgets.length} Budget-Einträge`}
          icon={<Wallet className="h-5 w-5" />}
          loading={loading}
          tone="neutral"
        />
        <SummaryCard
          label="Aktuell ausgegeben"
          value={formatCurrency(summary.totalSpent)}
          description={`${summary.percent.toFixed(0)}% des Monatsbudgets`}
          icon={<BadgeEuro className="h-5 w-5" />}
          loading={loading}
          tone={summary.percent >= 100 ? 'danger' : summary.percent >= 80 ? 'warning' : 'neutral'}
        />
        <SummaryCard
          label="Budget überschritten"
          value={summary.overBudgetCount.toString()}
          description={
            summary.overBudgetCount === 0
              ? 'Alle Budgets im grünen Bereich'
              : summary.overBudgetCount === 1
                ? '1 Budget über 100%'
                : `${summary.overBudgetCount} Budgets über 100%`
          }
          icon={<AlertTriangle className="h-5 w-5" />}
          loading={loading}
          tone={summary.overBudgetCount > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {/* Error-State */}
      {error && !loading && (
        <Alert variant="destructive" className="rounded-2xl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Budgets konnten nicht geladen werden</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadBudgets()}
              className="w-fit rounded-xl"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading-State */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Empty-State */}
      {!loading && !error && filteredBudgets.length === 0 && (
        <EmptyState
          isAdmin={isAdmin}
          pastMonth={pastMonth}
          onCreate={() => {
            setEditingBudget(null)
            setDialogOpen(true)
          }}
        />
      )}

      {/* Budget-Gruppen */}
      {!loading && !error && filteredBudgets.length > 0 && (
        <div className="space-y-6">
          {groupedByCustomer.map((group) => (
            <div key={group.id} className="space-y-3">
              {!activeCustomer && (
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {group.name}
                  </h2>
                  <Separator className="flex-1" />
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((budget) => (
                  <BudgetCard
                    key={budget.id}
                    budget={budget}
                    monthKey={selectedMonth}
                    canEdit={isAdmin && !pastMonth}
                    onEdit={() => {
                      setEditingBudget(budget)
                      setDialogOpen(true)
                    }}
                    onDelete={() => void handleDelete(budget)}
                    onOpenDetail={() => setDetailBudget(budget)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form-Dialog */}
      <BudgetFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingBudget(null)
        }}
        customers={customers}
        initialBudget={editingBudget}
        defaultCustomerId={activeCustomer?.id ?? null}
        selectedMonth={selectedMonth}
        onSaved={handleFormSaved}
      />

      {/* Detail-Sheet */}
      <BudgetDetailSheet
        budget={detailBudget}
        monthKey={selectedMonth}
        open={detailBudget !== null}
        onOpenChange={(open) => {
          if (!open) setDetailBudget(null)
        }}
        onManualSpendSaved={() => {
          void loadBudgets()
        }}
      />
    </div>
  )
}

// ─── Summary Card ────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string
  value: string
  description: string
  icon: React.ReactNode
  loading: boolean
  tone: 'neutral' | 'warning' | 'danger'
}

function SummaryCard({ label, value, description, icon, loading, tone }: SummaryCardProps) {
  const toneClasses =
    tone === 'danger'
      ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400'
      : tone === 'warning'
        ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400'
        : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'

  return (
    <Card className="rounded-2xl border-slate-100 bg-white shadow-sm dark:border-border dark:bg-card">
      <CardContent className="flex items-start gap-4 p-5">
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', toneClasses)}>
          {icon}
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
          )}
          <p className="text-xs text-slate-400 dark:text-slate-500">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Budget Card ─────────────────────────────────────────────────────────────

interface BudgetCardProps {
  budget: Budget
  monthKey: string
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
  onOpenDetail: () => void
}

function BudgetCard({
  budget,
  monthKey,
  canEdit,
  onEdit,
  onDelete,
  onOpenDetail,
}: BudgetCardProps) {
  const config = PLATFORM_CONFIG[budget.platform]
  const percent =
    budget.planned_amount > 0 ? (budget.spent_amount / budget.planned_amount) * 100 : 0
  const status = getSpendStatus(percent)
  const totalDays = daysInMonth(monthKey)
  const currentDay = currentDayOfMonth(monthKey)
  const remainingDays = Math.max(totalDays - currentDay, 0)
  const projected =
    currentDay > 0 ? (budget.spent_amount / currentDay) * totalDays : budget.spent_amount

  return (
    <Card
      className={cn(
        'group relative overflow-hidden rounded-2xl border shadow-sm transition-shadow hover:shadow-md',
        status.cardBorder
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                config.iconBg
              )}
              aria-hidden
            >
              <BarChart3 className={cn('h-5 w-5', config.iconText)} />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                {budget.label ?? config.label}
              </CardTitle>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="rounded-full border-slate-200 px-2 py-0 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
                >
                  {config.shortLabel}
                </Badge>
                {budget.campaign_ids && budget.campaign_ids.length > 0 && (
                  <Badge
                    variant="outline"
                    className="rounded-full border-blue-200 bg-blue-50 px-2 py-0 text-[10px] font-medium text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-400"
                  >
                    {budget.campaign_ids.length} Kampagne{budget.campaign_ids.length !== 1 ? 'n' : ''}
                  </Badge>
                )}
                {!budget.has_integration && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="rounded-full border-amber-200 bg-amber-50 px-2 py-0 text-[10px] font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-400"
                      >
                        Manuell
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      Keine API-Verbindung. Spend wird manuell erfasst.
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {status.tone === 'critical' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Kritisch: Spend über 150% des Budgets.
                </TooltipContent>
              </Tooltip>
            )}
            {canEdit && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      onClick={onEdit}
                      aria-label="Budget bearbeiten"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Bearbeiten</TooltipContent>
                </Tooltip>
                <InlineConfirm
                  message="Budget löschen? Alle Spend-Einträge werden entfernt."
                  confirmLabel="Löschen"
                  onConfirm={onDelete}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                    aria-label="Budget löschen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </InlineConfirm>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pb-5">
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Ausgegeben</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(budget.spent_amount, budget.currency)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 dark:text-slate-400">Geplant</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {formatCurrency(budget.planned_amount, budget.currency)}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Progress
              value={Math.min(percent, 100)}
              className="h-2 rounded-full bg-slate-100 dark:bg-slate-800"
              indicatorClassName={status.progressColor}
            />
            <div className="flex items-center justify-between text-[11px]">
              <span
                className={cn(
                  'font-medium',
                  status.tone === 'critical' || status.tone === 'danger'
                    ? 'text-red-600 dark:text-red-400'
                    : status.tone === 'warning'
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-slate-500 dark:text-slate-400'
                )}
              >
                {percent.toFixed(0)}% verbraucht
              </span>
              <span className="text-slate-400 dark:text-slate-500">
                {remainingDays} {remainingDays === 1 ? 'Tag' : 'Tage'} übrig
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <MetricPill label="CPC" value={budget.cpc} unit="€" />
          <MetricPill label="CPM" value={budget.cpm} unit="€" />
          <MetricPill label="ROAS" value={budget.roas} unit="x" />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900/60 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Hochrechnung Monat
          </span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {formatCurrency(projected, budget.currency)}
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full rounded-xl"
          onClick={onOpenDetail}
        >
          Details & Tagesverlauf
        </Button>
      </CardContent>
    </Card>
  )
}

function MetricPill({
  label,
  value,
  unit,
}: {
  label: string
  value: number | null
  unit: string
}) {
  const hasValue = value !== null && Number.isFinite(value)
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-2 py-1.5 dark:border-border dark:bg-card">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
        {hasValue ? `${value?.toFixed(2)}${unit}` : '—'}
      </p>
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({
  isAdmin,
  pastMonth,
  onCreate,
}: {
  isAdmin: boolean
  pastMonth: boolean
  onCreate: () => void
}) {
  return (
    <Card className="rounded-2xl border-dashed border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-900/30">
      <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
          <Wallet className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Noch keine Budgets hinterlegt
          </h3>
          <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
            {pastMonth
              ? 'Für diesen Monat wurden keine Budgets erfasst.'
              : 'Lege ein Monatsbudget pro Kunde und Plattform an, um den Verbrauch zu tracken und Alerts zu erhalten.'}
          </p>
        </div>
        {isAdmin && !pastMonth && (
          <Button variant="dark" className="rounded-xl" onClick={onCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Erstes Budget anlegen
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Form Dialog ─────────────────────────────────────────────────────────────

interface BudgetFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customers: ReturnType<typeof useActiveCustomer>['customers']
  initialBudget: Budget | null
  defaultCustomerId: string | null
  selectedMonth: string
  onSaved: (saved: Budget) => void
}

interface AvailableCampaign {
  id: string
  name: string
  status: string
  cost: number
}

function BudgetFormDialog({
  open,
  onOpenChange,
  customers,
  initialBudget,
  defaultCustomerId,
  selectedMonth,
  onSaved,
}: BudgetFormDialogProps) {
  const { toast } = useToast()
  const [customerId, setCustomerId] = useState<string>('')
  const [platform, setPlatform] = useState<Platform>('google_ads')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [threshold, setThreshold] = useState('80')
  const [saving, setSaving] = useState(false)

  // Campaign selection
  const [availableCampaigns, setAvailableCampaigns] = useState<AvailableCampaign[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(false)
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    if (initialBudget) {
      setCustomerId(initialBudget.customer_id)
      setPlatform(initialBudget.platform)
      setLabel(initialBudget.label ?? '')
      setAmount(initialBudget.planned_amount.toString())
      setThreshold(initialBudget.alert_threshold_percent.toString())
      setSelectedCampaignIds(initialBudget.campaign_ids ?? [])
    } else {
      setCustomerId(defaultCustomerId ?? customers[0]?.id ?? '')
      setPlatform('google_ads')
      setLabel('')
      setAmount('')
      setThreshold('80')
      setSelectedCampaignIds([])
    }
    setAvailableCampaigns([])
  }, [open, initialBudget, defaultCustomerId, customers])

  // Fetch available campaigns when customer+platform changes
  useEffect(() => {
    if (!open || !customerId) return
    let cancelled = false
    setCampaignsLoading(true)
    setAvailableCampaigns([])

    fetch(
      `/api/tenant/budgets/campaigns?customer_id=${encodeURIComponent(customerId)}&platform=${encodeURIComponent(platform)}`,
      { credentials: 'include' }
    )
      .then((res) => res.json())
      .then((data: { campaigns?: AvailableCampaign[] }) => {
        if (!cancelled) setAvailableCampaigns(data.campaigns ?? [])
      })
      .catch(() => {
        if (!cancelled) setAvailableCampaigns([])
      })
      .finally(() => {
        if (!cancelled) setCampaignsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, customerId, platform])

  const toggleCampaign = (id: string) => {
    setSelectedCampaignIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const allSelected = selectedCampaignIds.length === 0

  const canSubmit =
    customerId.trim() !== '' &&
    amount.trim() !== '' &&
    !Number.isNaN(Number(amount)) &&
    Number(amount) > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setSaving(true)
    try {
      const payload = {
        customer_id: customerId,
        platform,
        label: label.trim() || null,
        budget_month: selectedMonth,
        planned_amount: Number(amount),
        alert_threshold_percent: Number(threshold) || 80,
        campaign_ids: selectedCampaignIds.length > 0 ? selectedCampaignIds : null,
      }

      const url = initialBudget
        ? `/api/tenant/budgets/${initialBudget.id}`
        : '/api/tenant/budgets'
      const method = initialBudget ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorData.error ?? `Speichern fehlgeschlagen (${res.status})`)
      }

      const data = (await res.json()) as { budget?: Budget }
      if (!data.budget) throw new Error('Unerwartete Antwort des Servers.')

      toast({
        title: initialBudget ? 'Budget aktualisiert' : 'Budget angelegt',
      })
      onSaved(data.budget)
    } catch (err) {
      toast({
        title: 'Speichern fehlgeschlagen',
        description: err instanceof Error ? err.message : 'Bitte erneut versuchen.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            {initialBudget ? 'Budget bearbeiten' : 'Neues Budget anlegen'}
          </DialogTitle>
          <DialogDescription>
            Hinterlege ein geplantes Monatsbudget pro Kunde und Plattform. Wähle optional einzelne oder
            mehrere Kampagnen aus — oder tracke alle Kampagnen zusammen.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="budget-customer">Kunde</Label>
            <Select
              value={customerId}
              onValueChange={setCustomerId}
              disabled={!!initialBudget}
            >
              <SelectTrigger id="budget-customer" className="rounded-xl">
                <SelectValue placeholder="Kunde auswählen" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-platform">Plattform</Label>
            <Select
              value={platform}
              onValueChange={(value) => {
                setPlatform(value as Platform)
                setSelectedCampaignIds([])
              }}
              disabled={!!initialBudget}
            >
              <SelectTrigger id="budget-platform" className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="google_ads">Google Ads</SelectItem>
                <SelectItem value="meta_ads">Meta Ads</SelectItem>
                <SelectItem value="tiktok_ads">TikTok Ads</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Campaign Scope */}
          <div className="space-y-2">
            <Label>
              Kampagnen{' '}
              <span className="text-slate-400">(optional)</span>
            </Label>
            {campaignsLoading && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-500 dark:border-border">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Kampagnen werden geladen…
              </div>
            )}
            {!campaignsLoading && availableCampaigns.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-xs text-slate-400 dark:border-border">
                Keine verbundene Kampagnendaten verfügbar — Budget trackt den gesamten Account.
              </p>
            )}
            {!campaignsLoading && availableCampaigns.length > 0 && (
              <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-border">
                {/* "Alle Kampagnen" option */}
                <button
                  type="button"
                  onClick={() => setSelectedCampaignIds([])}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60',
                    allSelected && 'bg-blue-50 dark:bg-blue-950/20'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      allSelected
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    )}
                  >
                    {allSelected && (
                      <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-current">
                        <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className={cn('font-medium', allSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200')}>
                    Alle Kampagnen
                  </span>
                </button>
                <Separator />
                {availableCampaigns.map((campaign) => {
                  const checked = selectedCampaignIds.includes(campaign.id)
                  return (
                    <button
                      key={campaign.id}
                      type="button"
                      onClick={() => toggleCampaign(campaign.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60',
                        checked && 'bg-blue-50/60 dark:bg-blue-950/10'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                          checked
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        )}
                      >
                        {checked && (
                          <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-current">
                            <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                        {campaign.name}
                      </span>
                      {campaign.cost > 0 && (
                        <span className="shrink-0 tabular-nums text-slate-400 dark:text-slate-500">
                          {formatCurrency(campaign.cost)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            {!allSelected && (
              <p className="text-[11px] text-blue-600 dark:text-blue-400">
                {selectedCampaignIds.length} Kampagne{selectedCampaignIds.length !== 1 ? 'n' : ''} ausgewählt
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-label">
              Bezeichnung <span className="text-slate-400">(optional)</span>
            </Label>
            <Input
              id="budget-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="z.B. Brand Keywords"
              className="rounded-xl"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="budget-amount">Geplantes Budget (€)</Label>
              <Input
                id="budget-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="rounded-xl"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget-threshold">Alert ab (%)</Label>
              <Input
                id="budget-threshold"
                type="number"
                min="0"
                max="100"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="rounded-xl"
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              variant="dark"
              disabled={!canSubmit || saving}
              className="rounded-xl"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initialBudget ? 'Änderungen speichern' : 'Budget anlegen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Detail Sheet (Daily Spend Chart + Manual Entry) ─────────────────────────

interface BudgetDetailSheetProps {
  budget: Budget | null
  monthKey: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onManualSpendSaved: () => void
}

function BudgetDetailSheet({
  budget,
  monthKey,
  open,
  onOpenChange,
  onManualSpendSaved,
}: BudgetDetailSheetProps) {
  const { toast } = useToast()
  const [entries, setEntries] = useState<DailySpendPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualDate, setManualDate] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualSaving, setManualSaving] = useState(false)

  const loadEntries = useCallback(async () => {
    if (!budget) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/tenant/budgets/${budget.id}/spend`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Verlauf konnte nicht geladen werden (${res.status})`)
      const data = (await res.json()) as DailySpendResponse
      setEntries(data.entries ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [budget])

  useEffect(() => {
    if (open && budget) {
      void loadEntries()
      const today = new Date()
      setManualDate(
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
          today.getDate()
        ).padStart(2, '0')}`
      )
      setManualAmount('')
    }
  }, [open, budget, loadEntries])

  const chartData = useMemo(() => {
    if (!budget) return [] as { label: string; value: number; target: number; over: boolean }[]
    const total = budget.planned_amount
    const days = daysInMonth(monthKey)
    const target = days > 0 ? total / days : 0
    const { year, month } = parseMonthKey(monthKey)

    const entriesMap = new Map<string, number>()
    for (const entry of entries) {
      entriesMap.set(entry.date, entry.amount)
    }

    return Array.from({ length: days }, (_, i) => {
      const day = i + 1
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const value = entriesMap.get(dateKey) ?? 0
      return {
        label: String(day),
        value,
        target,
        over: value > target,
      }
    })
  }, [budget, monthKey, entries])

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!budget) return
    const numericAmount = Number(manualAmount)
    if (!manualDate || !Number.isFinite(numericAmount) || numericAmount < 0) return

    setManualSaving(true)
    try {
      const res = await fetch(`/api/tenant/budgets/${budget.id}/spend`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spend_date: manualDate,
          amount: numericAmount,
          source: 'manual',
        }),
      })
      if (!res.ok) throw new Error(`Speichern fehlgeschlagen (${res.status})`)
      toast({ title: 'Spend-Eintrag gespeichert' })
      setManualAmount('')
      await loadEntries()
      onManualSpendSaved()
    } catch (err) {
      toast({
        title: 'Fehler beim Speichern',
        description: err instanceof Error ? err.message : 'Bitte erneut versuchen.',
        variant: 'destructive',
      })
    } finally {
      setManualSaving(false)
    }
  }

  if (!budget) return null

  const config = PLATFORM_CONFIG[budget.platform]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-0 sm:max-w-xl"
      >
        <div className="p-6">
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-xl',
                  config.iconBg
                )}
              >
                <BarChart3 className={cn('h-5 w-5', config.iconText)} />
              </span>
              {budget.label ?? config.label}
            </SheetTitle>
            <SheetDescription>
              {budget.customer_name} · {config.label} · {monthLabel(monthKey)}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <Card className="rounded-2xl border-slate-100 shadow-none dark:border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Täglicher Verlauf
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Vergleich zwischen tatsächlichem Spend und linearem Tages-Soll.
                </p>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-48 w-full rounded-xl" />
                ) : error ? (
                  <Alert variant="destructive" className="rounded-xl">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => `${Math.round(v)}€`}
                      />
                      <RechartsTooltip
                        cursor={{ fill: 'rgba(100, 116, 139, 0.08)' }}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          fontSize: '12px',
                          color: '#0f172a',
                          padding: '8px 12px',
                        }}
                        formatter={(value: unknown) => [
                          formatCurrencyPrecise(Number(value ?? 0), budget.currency),
                          'Spend',
                        ]}
                        labelFormatter={(label) => `Tag ${label}`}
                      />
                      <ReferenceLine
                        y={chartData[0]?.target ?? 0}
                        stroke="#6366f1"
                        strokeDasharray="4 4"
                        label={{
                          value: 'Ziel',
                          position: 'insideTopRight',
                          fill: '#6366f1',
                          fontSize: 11,
                        }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, idx) => (
                          <Cell
                            key={`cell-${idx}`}
                            fill={entry.over ? '#ef4444' : config.accent}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-100 shadow-none dark:border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Manuellen Spend-Eintrag hinzufügen
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nutze diese Option, wenn keine API-Verbindung besteht oder du Werte anpassen willst.
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleManualSubmit} className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="manual-date">Datum</Label>
                      <Input
                        id="manual-date"
                        type="date"
                        value={manualDate}
                        onChange={(e) => setManualDate(e.target.value)}
                        className="rounded-xl"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="manual-amount">Betrag (€)</Label>
                      <Input
                        id="manual-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={manualAmount}
                        onChange={(e) => setManualAmount(e.target.value)}
                        placeholder="0.00"
                        className="rounded-xl"
                        required
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={manualSaving}
                    className="w-full rounded-xl"
                  >
                    {manualSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Eintrag speichern
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
