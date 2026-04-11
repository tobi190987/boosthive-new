'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileText,
  Filter,
  Grid2x2,
  LayoutGrid,
  LineChart,
  Plug,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useActiveCustomer } from '@/lib/active-customer-context'
import type {
  PortfolioCustomerSummary,
  PortfolioSummaryResponse,
} from '@/app/api/tenant/portfolio/summary/route'

type SortKey = 'name-asc' | 'traffic-drop' | 'status' | 'updated-desc'
type ViewMode = 'grid' | 'table'
type IntegrationFilter = 'all' | 'ga4' | 'google_ads' | 'meta_ads' | 'tiktok_ads' | 'gsc'

interface TrafficData {
  loading: boolean
  connected: boolean
  visitors?: number
  previousVisitors?: number
  deltaPercent?: number | null
  error?: string
  staleHours?: number | null
}

interface PortfolioWorkspaceProps {
  isAdmin: boolean
  tenantName: string
}

const PAGE_SIZE = 20
const ANOMALY_THRESHOLD = 20
const STALE_HOURS_THRESHOLD = 48

function formatNumber(n: number): string {
  return new Intl.NumberFormat('de-DE').format(n)
}

function formatDelta(delta: number | null | undefined): string {
  if (delta == null || Number.isNaN(delta)) return '—'
  const rounded = Math.round(delta)
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded}%`
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHours < 1) return 'vor wenigen Minuten'
  if (diffHours < 24) return `vor ${diffHours} Std.`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'vor 1 Tag'
  if (diffDays < 30) return `vor ${diffDays} Tagen`
  const diffMonths = Math.floor(diffDays / 30)
  return `vor ${diffMonths} Monaten`
}

export function PortfolioWorkspace({ isAdmin, tenantName }: PortfolioWorkspaceProps) {
  const router = useRouter()
  const { setActiveCustomer, customers: activeCustomers } = useActiveCustomer()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PortfolioSummaryResponse | null>(null)
  const [trafficByCustomer, setTrafficByCustomer] = useState<Record<string, TrafficData>>({})

  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name-asc')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all')
  const [integrationFilter, setIntegrationFilter] = useState<IntegrationFilter>('all')
  const [alertsOnly, setAlertsOnly] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [page, setPage] = useState(1)

  const loadSummary = useCallback(
    async (showRefreshToast = false) => {
      try {
        if (showRefreshToast) setRefreshing(true)
        else setLoading(true)
        setError(null)

        const response = await fetch('/api/tenant/portfolio/summary', {
          credentials: 'include',
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || 'Portfolio konnte nicht geladen werden.')
        }
        const payload: PortfolioSummaryResponse = await response.json()
        setData(payload)
        if (showRefreshToast) {
          toast.success('Portfolio aktualisiert.')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
        setError(message)
        if (showRefreshToast) toast.error(message)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    []
  )

  useEffect(() => {
    void loadSummary(false)
  }, [loadSummary])

  // Traffic-Daten pro Kunde mit GA4 im Hintergrund laden (parallel)
  useEffect(() => {
    if (!data) return
    const ga4Customers = data.customers.filter((c) => c.integrations.ga4 === 'connected')
    if (ga4Customers.length === 0) return

    let cancelled = false
    const initial: Record<string, TrafficData> = {}
    for (const customer of ga4Customers) {
      initial[customer.id] = { loading: true, connected: true }
    }
    setTrafficByCustomer((prev) => ({ ...prev, ...initial }))

    async function fetchOne(customerId: string) {
      try {
        const res = await fetch(
          `/api/tenant/integrations/ga4/${customerId}/data?range=7d`,
          { credentials: 'include' }
        )
        if (!res.ok) {
          throw new Error('Fehler beim Laden')
        }
        const json = await res.json()
        if (cancelled) return
        const visitors = Number(json?.data?.totals?.activeUsers ?? json?.data?.totalUsers ?? 0)
        const previousVisitors = Number(
          json?.trend?.previousTotals?.activeUsers ??
            json?.trend?.previousTotalUsers ??
            0
        )
        const deltaPercent =
          previousVisitors > 0
            ? ((visitors - previousVisitors) / previousVisitors) * 100
            : null
        const cachedAt: string | undefined = json?.cachedAt || json?.data?.cachedAt
        let staleHours: number | null = null
        if (cachedAt) {
          staleHours = Math.floor(
            (Date.now() - new Date(cachedAt).getTime()) / (1000 * 60 * 60)
          )
        }
        setTrafficByCustomer((prev) => ({
          ...prev,
          [customerId]: {
            loading: false,
            connected: true,
            visitors,
            previousVisitors,
            deltaPercent,
            staleHours,
          },
        }))
      } catch (err) {
        if (cancelled) return
        setTrafficByCustomer((prev) => ({
          ...prev,
          [customerId]: {
            loading: false,
            connected: true,
            error: err instanceof Error ? err.message : 'Fehler',
          },
        }))
      }
    }

    for (const customer of ga4Customers) {
      void fetchOne(customer.id)
    }

    return () => {
      cancelled = true
    }
  }, [data])

  const filteredCustomers = useMemo(() => {
    if (!data) return []
    const query = searchQuery.trim().toLowerCase()
    return data.customers
      .filter((customer) => {
        if (statusFilter !== 'all' && customer.status !== statusFilter) return false
        if (integrationFilter !== 'all' && customer.integrations[integrationFilter] !== 'connected')
          return false
        if (query) {
          const haystack = `${customer.name} ${customer.domain ?? ''} ${customer.industry ?? ''}`.toLowerCase()
          if (!haystack.includes(query)) return false
        }
        if (alertsOnly) {
          const traffic = trafficByCustomer[customer.id]
          const hasTrafficAlert =
            !!traffic?.deltaPercent && Math.abs(traffic.deltaPercent) > ANOMALY_THRESHOLD
          const hasIntegrationError = customer.integrationsError
          const hasStaleData = !!traffic?.staleHours && traffic.staleHours > STALE_HOURS_THRESHOLD
          if (!hasTrafficAlert && !hasIntegrationError && !hasStaleData) return false
        }
        return true
      })
      .sort((a, b) => {
        switch (sortKey) {
          case 'name-asc':
            return a.name.localeCompare(b.name, 'de')
          case 'status':
            return a.status.localeCompare(b.status)
          case 'updated-desc':
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          case 'traffic-drop': {
            const da = trafficByCustomer[a.id]?.deltaPercent ?? 0
            const db = trafficByCustomer[b.id]?.deltaPercent ?? 0
            return da - db
          }
          default:
            return 0
        }
      })
  }, [data, searchQuery, statusFilter, integrationFilter, alertsOnly, sortKey, trafficByCustomer])

  useEffect(() => {
    setPage(1)
  }, [searchQuery, statusFilter, integrationFilter, alertsOnly, sortKey])

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE))
  const pagedCustomers = filteredCustomers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== 'all' ||
    integrationFilter !== 'all' ||
    alertsOnly

  const resetFilters = useCallback(() => {
    setSearchQuery('')
    setStatusFilter('all')
    setIntegrationFilter('all')
    setAlertsOnly(false)
  }, [])

  const handleOpenCustomer = useCallback(
    (customer: PortfolioCustomerSummary) => {
      const match = activeCustomers.find((c) => c.id === customer.id)
      if (match) setActiveCustomer(match)
      router.push('/dashboard')
    },
    [activeCustomers, router, setActiveCustomer]
  )

  const handleReport = useCallback(
    (customer: PortfolioCustomerSummary) => {
      const match = activeCustomers.find((c) => c.id === customer.id)
      if (match) setActiveCustomer(match)
      router.push('/exports')
    },
    [activeCustomers, router, setActiveCustomer]
  )

  const handleOpenActivity = useCallback(
    (customer: PortfolioCustomerSummary) => {
      router.push(`/tools/customers?customer=${customer.id}&tab=notes`)
    },
    [router]
  )

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Portfolio konnte nicht geladen werden</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button onClick={() => loadSummary(false)} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> Erneut versuchen
          </Button>
        </CardContent>
      </Card>
    )
  }

  const customersTotal = data?.customers.length ?? 0

  // Empty state
  if (customersTotal === 0) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            Alle Kunden von {tenantName} auf einen Blick.
          </p>
        </header>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Noch keine Kunden angelegt</h3>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Sobald du deine ersten Kunden anlegst, erscheint hier eine Gesamtübersicht
                mit Metriken, Alerts und Handlungsbedarf.
              </p>
            </div>
            {isAdmin && (
              <Button onClick={() => router.push('/tools/customers')}>
                Ersten Kunden anlegen
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
            <p className="text-sm text-muted-foreground">
              {customersTotal} {customersTotal === 1 ? 'Kunde' : 'Kunden'} im Überblick —{' '}
              {filteredCustomers.length} gefiltert
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadSummary(true)}
              disabled={refreshing}
              aria-label="Portfolio aktualisieren"
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
              Aktualisieren
            </Button>
          </div>
        </header>

        <ActionBar actionBar={data?.actionBar} />

        <FiltersBar
          searchQuery={searchQuery}
          onSearch={setSearchQuery}
          sortKey={sortKey}
          onSortChange={setSortKey}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          integrationFilter={integrationFilter}
          onIntegrationChange={setIntegrationFilter}
          alertsOnly={alertsOnly}
          onAlertsOnlyChange={setAlertsOnly}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          hasActiveFilters={hasActiveFilters}
          onReset={resetFilters}
        />

        {filteredCustomers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                <Filter className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold">Keine Kunden passen zu den Filtern</h3>
              <p className="max-w-md text-sm text-muted-foreground">
                Passe Suche oder Filter an, um andere Kunden zu sehen.
              </p>
              <Button variant="outline" onClick={resetFilters}>
                Filter zurücksetzen
              </Button>
            </CardContent>
          </Card>
        ) : viewMode === 'grid' ? (
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            role="list"
            aria-label="Kunden-Portfolio"
          >
            {pagedCustomers.map((customer) => (
              <CustomerCard
                key={customer.id}
                customer={customer}
                traffic={trafficByCustomer[customer.id]}
                onOpen={() => handleOpenCustomer(customer)}
                onReport={() => handleReport(customer)}
                onActivity={() => handleOpenActivity(customer)}
              />
            ))}
          </div>
        ) : (
          <PortfolioTable
            customers={pagedCustomers}
            trafficByCustomer={trafficByCustomer}
            onOpen={handleOpenCustomer}
          />
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredCustomers.length)} von{' '}
              {filteredCustomers.length}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Zurück
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Weiter
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

function ActionBar({ actionBar }: { actionBar?: PortfolioSummaryResponse['actionBar'] }) {
  const router = useRouter()
  const pending = actionBar?.pendingApprovals ?? 0
  const followups = actionBar?.overdueFollowups ?? 0
  const broken = actionBar?.brokenIntegrations ?? 0
  const total = pending + followups + broken

  if (total === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-emerald-800 dark:text-emerald-300">
            Keine offenen Handlungen. Alle Kunden-Flows laufen.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2 py-4">
        <span className="text-sm font-medium text-muted-foreground">Handlungsbedarf:</span>
        {pending > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 rounded-full"
            onClick={() => router.push('/tools/approvals')}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>
              <strong>{pending}</strong> Freigaben ausstehend
            </span>
          </Button>
        )}
        {followups > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 rounded-full"
            onClick={() => router.push('/tools/customers')}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            <span>
              <strong>{followups}</strong> Follow-ups fällig
            </span>
          </Button>
        )}
        {broken > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 rounded-full border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30"
            onClick={() => router.push('/tools/customers')}
          >
            <Plug className="h-3.5 w-3.5" />
            <span>
              <strong>{broken}</strong> Integration{broken === 1 ? '' : 'en'} fehlerhaft
            </span>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

interface FiltersBarProps {
  searchQuery: string
  onSearch: (value: string) => void
  sortKey: SortKey
  onSortChange: (value: SortKey) => void
  statusFilter: 'all' | 'active' | 'paused'
  onStatusChange: (value: 'all' | 'active' | 'paused') => void
  integrationFilter: IntegrationFilter
  onIntegrationChange: (value: IntegrationFilter) => void
  alertsOnly: boolean
  onAlertsOnlyChange: (value: boolean) => void
  viewMode: ViewMode
  onViewModeChange: (value: ViewMode) => void
  hasActiveFilters: boolean
  onReset: () => void
}

function FiltersBar({
  searchQuery,
  onSearch,
  sortKey,
  onSortChange,
  statusFilter,
  onStatusChange,
  integrationFilter,
  onIntegrationChange,
  alertsOnly,
  onAlertsOnlyChange,
  viewMode,
  onViewModeChange,
  hasActiveFilters,
  onReset,
}: FiltersBarProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Kunde suchen (Name, Domain, Branche)..."
              className="pl-10"
              aria-label="Kunde suchen"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sortKey} onValueChange={(v) => onSortChange(v as SortKey)}>
              <SelectTrigger className="h-9 w-[180px]" aria-label="Sortierung">
                <SelectValue placeholder="Sortieren" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">Name (A–Z)</SelectItem>
                <SelectItem value="traffic-drop">Traffic-Einbruch zuerst</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="updated-desc">Zuletzt aktualisiert</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1 rounded-lg border p-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onViewModeChange('grid')}
                    aria-label="Grid-Ansicht"
                    aria-pressed={viewMode === 'grid'}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Grid-Ansicht</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onViewModeChange('table')}
                    aria-label="Tabellen-Ansicht"
                    aria-pressed={viewMode === 'table'}
                  >
                    <Grid2x2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Tabellen-Ansicht</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => onStatusChange(v as typeof statusFilter)}>
            <SelectTrigger className="h-8 w-[140px]" aria-label="Status filtern">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="active">Aktiv</SelectItem>
              <SelectItem value="paused">Pausiert</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={integrationFilter}
            onValueChange={(v) => onIntegrationChange(v as IntegrationFilter)}
          >
            <SelectTrigger className="h-8 w-[180px]" aria-label="Integration filtern">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Integrationen</SelectItem>
              <SelectItem value="ga4">Hat GA4</SelectItem>
              <SelectItem value="google_ads">Hat Google Ads</SelectItem>
              <SelectItem value="meta_ads">Hat Meta Ads</SelectItem>
              <SelectItem value="tiktok_ads">Hat TikTok Ads</SelectItem>
              <SelectItem value="gsc">Hat Search Console</SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant={alertsOnly ? 'default' : 'outline'}
            size="sm"
            className="h-8 rounded-full"
            onClick={() => onAlertsOnlyChange(!alertsOnly)}
            aria-pressed={alertsOnly}
          >
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
            Nur mit Alerts
          </Button>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              onClick={onReset}
            >
              Filter zurücksetzen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface CustomerCardProps {
  customer: PortfolioCustomerSummary
  traffic: TrafficData | undefined
  onOpen: () => void
  onReport: () => void
  onActivity: () => void
}

function CustomerCard({ customer, traffic, onOpen, onReport, onActivity }: CustomerCardProps) {
  const hasAlert =
    traffic?.deltaPercent != null && Math.abs(traffic.deltaPercent) > ANOMALY_THRESHOLD
  const isCritical = hasAlert && (traffic?.deltaPercent ?? 0) < 0
  const isStale = !!traffic?.staleHours && traffic.staleHours > STALE_HOURS_THRESHOLD

  return (
    <Card
      role="listitem"
      className={cn(
        'group relative flex h-full flex-col overflow-hidden transition-all hover:border-slate-300 hover:shadow-md dark:hover:border-slate-700',
        hasAlert && isCritical && 'border-red-300 dark:border-red-900/60',
        hasAlert && !isCritical && 'border-amber-300 dark:border-amber-900/60'
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col p-5 text-left"
        aria-label={`Dashboard für ${customer.name} öffnen`}
      >
        <div className="flex items-start gap-3">
          <CustomerAvatar customer={customer} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-sm font-semibold">{customer.name}</h3>
              {hasAlert && <AnomalyBadge traffic={traffic!} />}
            </div>
            {customer.domain && (
              <p className="truncate text-xs text-muted-foreground">{customer.domain}</p>
            )}
            <div className="mt-1.5 flex items-center gap-1.5">
              <StatusBadge status={customer.status} />
              {customer.integrationsError && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex h-5 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400"
                      role="status"
                    >
                      <Plug className="h-3 w-3" />
                      Integration
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Eine oder mehrere Integrationen liefern Fehler.</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3 border-t pt-4">
          <TrafficRow traffic={traffic} connected={customer.integrations.ga4 === 'connected'} />
          <IntegrationIcons integrations={customer.integrations} />
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className={cn(isStale && 'text-amber-600 dark:text-amber-400')}>
            {isStale ? 'Daten veraltet' : 'Aktualisiert'} · {formatRelativeTime(customer.updated_at)}
          </span>
          {customer.openApprovalsCount > 0 && (
            <Badge variant="secondary" className="h-4 text-[10px]">
              {customer.openApprovalsCount} offen
            </Badge>
          )}
        </div>
      </button>

      <div className="flex items-center gap-1 border-t bg-muted/30 px-3 py-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onOpen()
              }}
            >
              <LineChart className="mr-1 h-3.5 w-3.5" />
              Dashboard
            </Button>
          </TooltipTrigger>
          <TooltipContent>Dashboard für diesen Kunden öffnen</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onActivity()
              }}
            >
              <ClipboardList className="mr-1 h-3.5 w-3.5" />
              Aktivität
            </Button>
          </TooltipTrigger>
          <TooltipContent>Notiz oder Aktivität loggen</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onReport()
              }}
            >
              <FileText className="mr-1 h-3.5 w-3.5" />
              Report
            </Button>
          </TooltipTrigger>
          <TooltipContent>Report erstellen</TooltipContent>
        </Tooltip>
      </div>
    </Card>
  )
}

function CustomerAvatar({ customer }: { customer: PortfolioCustomerSummary }) {
  const initials = customer.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

  if (customer.logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={customer.logo_url}
        alt={`${customer.name} Logo`}
        className="h-10 w-10 shrink-0 rounded-xl border object-cover"
      />
    )
  }

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-muted text-xs font-semibold text-muted-foreground"
      aria-hidden="true"
    >
      {initials || <Users className="h-4 w-4" />}
    </div>
  )
}

function StatusBadge({ status }: { status: 'active' | 'paused' }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 text-[10px]',
        status === 'active'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400'
          : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400'
      )}
    >
      {status === 'active' ? 'Aktiv' : 'Pausiert'}
    </Badge>
  )
}

function AnomalyBadge({ traffic }: { traffic: TrafficData }) {
  const delta = traffic.deltaPercent ?? 0
  const isCritical = delta < 0
  const visitors = traffic.visitors ?? 0
  const previous = traffic.previousVisitors ?? 0

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-[10px] font-medium',
            isCritical
              ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
          )}
          role="status"
          aria-label={`Anomalie: Traffic ${formatDelta(delta)} gegenüber Vorwoche`}
        >
          <AlertTriangle className="h-3 w-3" />
          {formatDelta(delta)}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Traffic {formatDelta(delta)} vs. Vorwoche ({formatNumber(previous)} → {formatNumber(visitors)}{' '}
        Besucher)
      </TooltipContent>
    </Tooltip>
  )
}

function TrafficRow({ traffic, connected }: { traffic: TrafficData | undefined; connected: boolean }) {
  if (!connected) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" />
          Traffic (7T)
        </span>
        <span className="text-muted-foreground">Keine Daten — GA4 verbinden</span>
      </div>
    )
  }
  if (!traffic || traffic.loading) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" />
          Traffic (7T)
        </span>
        <Skeleton className="h-3 w-16" />
      </div>
    )
  }
  if (traffic.error) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" />
          Traffic (7T)
        </span>
        <span className="text-amber-600 dark:text-amber-400">Ladefehler</span>
      </div>
    )
  }
  const delta = traffic.deltaPercent
  const deltaColor =
    delta == null
      ? 'text-muted-foreground'
      : delta < -ANOMALY_THRESHOLD
        ? 'text-red-600 dark:text-red-400'
        : delta > ANOMALY_THRESHOLD
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-muted-foreground'

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" />
        Traffic (7T)
      </span>
      <span className="flex items-center gap-2">
        <span className="font-semibold">{formatNumber(traffic.visitors ?? 0)}</span>
        <span className={cn('tabular-nums', deltaColor)}>{formatDelta(delta)}</span>
      </span>
    </div>
  )
}

function IntegrationIcons({
  integrations,
}: {
  integrations: PortfolioCustomerSummary['integrations']
}) {
  const items: { key: keyof typeof integrations; label: string; abbr: string }[] = [
    { key: 'ga4', label: 'Google Analytics 4', abbr: 'GA4' },
    { key: 'google_ads', label: 'Google Ads', abbr: 'GA' },
    { key: 'meta_ads', label: 'Meta Ads', abbr: 'FB' },
    { key: 'tiktok_ads', label: 'TikTok Ads', abbr: 'TT' },
    { key: 'gsc', label: 'Search Console', abbr: 'GSC' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((item) => {
        const state = integrations[item.key]
        if (state === 'disconnected') return null
        return (
          <Tooltip key={item.key}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  'inline-flex h-5 items-center rounded-md border px-1.5 text-[10px] font-medium',
                  state === 'connected'
                    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-400'
                    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400'
                )}
              >
                {item.abbr}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {item.label} · {state === 'connected' ? 'verbunden' : 'Fehler'}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

interface PortfolioTableProps {
  customers: PortfolioCustomerSummary[]
  trafficByCustomer: Record<string, TrafficData>
  onOpen: (customer: PortfolioCustomerSummary) => void
}

function PortfolioTable({ customers, trafficByCustomer, onOpen }: PortfolioTableProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kunde</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Traffic (7T)</TableHead>
              <TableHead>Δ Vorwoche</TableHead>
              <TableHead>Integrationen</TableHead>
              <TableHead>Offene Freigaben</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => {
              const traffic = trafficByCustomer[customer.id]
              const delta = traffic?.deltaPercent
              return (
                <TableRow
                  key={customer.id}
                  className="cursor-pointer"
                  onClick={() => onOpen(customer)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <CustomerAvatar customer={customer} />
                      <div className="min-w-0">
                        <p className="truncate">{customer.name}</p>
                        {customer.domain && (
                          <p className="truncate text-xs text-muted-foreground">
                            {customer.domain}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={customer.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {customer.integrations.ga4 !== 'connected' ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : !traffic || traffic.loading ? (
                      <Skeleton className="h-3 w-14" />
                    ) : traffic.error ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400">Fehler</span>
                    ) : (
                      formatNumber(traffic.visitors ?? 0)
                    )}
                  </TableCell>
                  <TableCell>
                    {delta == null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={cn(
                          'text-xs font-medium tabular-nums',
                          delta < -ANOMALY_THRESHOLD
                            ? 'text-red-600 dark:text-red-400'
                            : delta > ANOMALY_THRESHOLD
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-muted-foreground'
                        )}
                      >
                        {formatDelta(delta)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <IntegrationIcons integrations={customer.integrations} />
                  </TableCell>
                  <TableCell>
                    {customer.openApprovalsCount > 0 ? (
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        {customer.openApprovalsCount}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpen(customer)
                      }}
                    >
                      Öffnen
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
