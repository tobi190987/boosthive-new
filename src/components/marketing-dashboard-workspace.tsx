'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  Minus,
  MousePointerClick,
  RefreshCw,
  Search,
  TrendingUp,
  UserCheck,
  Users2,
  Wallet,
  Zap,
} from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useActiveCustomer } from '@/lib/active-customer-context'
import { CustomerSelectorDropdown } from '@/components/customer-selector-dropdown'
import { CustomerDetailWorkspace } from '@/components/customer-detail-workspace'
import { NoCustomerSelected } from '@/components/no-customer-selected'
import { TrendAreaChart } from '@/components/trend-area-chart'
import { Area, AreaChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import {
  MARKETING_DASHBOARD_REFRESH_EVENT,
  MARKETING_DASHBOARD_REFRESH_STORAGE_KEY,
  readMarketingDashboardRefreshPayload,
} from '@/lib/marketing-dashboard-refresh'
import type { TenantShellContext } from '@/lib/tenant-shell'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DateRange = 'today' | '7d' | '30d' | '90d'

interface TrendValue {
  value: number
  trend: number | null // percentage change vs. previous period
}

interface GA4Data {
  sessions: number
  users: number
  pageviews: number
  bounceRate: number
  avgSessionDuration: number
  conversions: number
  timeseries: { label: string; value: number }[]
  isCached?: boolean
  cacheAgeMinutes?: number
  googleEmail?: string
  propertyName?: string
  propertyId?: string
  message?: string
}

interface GSCData {
  impressions: number
  clicks: number
  avgCtr: number
  avgPosition: number
  topKeywords: { keyword: string; clicks: number; impressions: number; ctr: number; position: number }[]
  timeseries?: { label: string; value: number }[]
}

interface AdsCampaign {
  name: string
  status: string
  budget: number
  clicks: number
  cost: number
  conversions: number
}

interface GoogleAdsData {
  campaigns: AdsCampaign[]
  totalCost: number
  avgCpc: number
  totalConversions: number
}

interface MetaCampaign {
  name: string
  reach: number
  impressions: number
  cpm: number
  conversions: number
}

interface MetaAdsData {
  campaigns: MetaCampaign[]
  totalCost: number
  avgCpm: number
  totalReach?: number
  totalImpressions?: number
  totalConversions?: number
  currency?: string
}

interface TikTokCampaign {
  name: string
  status?: string
  videoViews?: number
  views: number
  clicks: number
  cpc: number
  cost: number
}

interface TikTokData {
  campaigns: TikTokCampaign[]
  totalCost: number
  totalClicks?: number
  totalVideoViews?: number
  averageCpc?: number
  activeCampaigns?: number
  currency?: string
  isCached?: boolean
  cacheAgeMinutes?: number
  message?: string
}

interface PlatformState<T> {
  connected: boolean
  loading: boolean
  error: string | null
  data: T | null
  trend: number | null
}

interface CustomerDetailData {
  id: string
  name: string
  domain?: string | null
  status: 'active' | 'paused'
  created_at: string
  updated_at: string
  industry?: string
  contact_email?: string | null
  logo_url?: string
  internal_notes?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: 'Heute',
  '7d': 'Letzte 7 Tage',
  '30d': 'Letzte 30 Tage',
  '90d': 'Letzte 90 Tage',
}

const DATE_RANGE_TAB_LABELS: Record<DateRange, string> = {
  today: 'Heute',
  '7d': '7 Tage',
  '30d': '30 Tage',
  '90d': '90 Tage',
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('de-DE').format(n)
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

function formatPercent(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n / 100)
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')} Min.`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface KPICardProps {
  label: string
  value: string | null
  trend: number | null
  icon: React.ReactNode
  loading: boolean
  color: string
  size?: 'default' | 'featured'
  className?: string
  timeseries?: { label: string; value: number }[]
}

function formatTimeseriesTooltipDateLabel(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (isoMatch) return `${isoMatch[3]}.${isoMatch[2]}`

  const compactMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(raw)
  if (compactMatch) return `${compactMatch[3]}.${compactMatch[2]}`

  const dottedMatch = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(raw)
  if (dottedMatch) return `${dottedMatch[1].padStart(2, '0')}.${dottedMatch[2].padStart(2, '0')}`

  return raw
}

function KPICard({ label, value, trend, icon, loading, color, size = 'default', className, timeseries }: KPICardProps) {
  const hasChart = !loading && timeseries && timeseries.length > 1

  if (size === 'featured') {
    return (
      <Card className={`rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:bg-card h-full ${className ?? ''}`}>
        <CardContent className="flex h-full flex-col p-6">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${color}18` }}
          >
            {icon}
          </div>

          {/* Sparkline */}
          <div className="flex-1 min-h-0 my-3">
            {loading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : hasChart ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeseries} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <RechartsTooltip
                    cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 4' }}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      fontSize: '12px',
                      color: '#0f172a',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                      padding: '8px 12px',
                    }}
                    formatter={(v) => [new Intl.NumberFormat('de-DE').format(Number(v)), label]}
                    labelFormatter={(lbl, payload) => {
                      const seriesLabel = payload?.[0]?.payload?.label
                      return formatTimeseriesTooltipDateLabel(seriesLabel ?? lbl)
                    }}
                    labelStyle={{ color: '#64748b', marginBottom: '2px', fontWeight: 500 }}
                  />
                  <Area
                    type="monotoneX"
                    dataKey="value"
                    stroke={color}
                    strokeWidth={2}
                    fill={`url(#spark-${label})`}
                    dot={false}
                    activeDot={{ r: 4, fill: '#ffffff', stroke: color, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : null}
          </div>

          <div>
            {loading ? (
              <>
                <Skeleton className="mb-2 h-10 w-28" />
                <Skeleton className="h-4 w-20" />
              </>
            ) : (
              <>
                <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                  {value ?? '--'}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
                  {trend !== null && <TrendBadge value={trend} />}
                </div>
              </>
            )}
          </div>
          <div className="mt-4 h-1 w-10 rounded-full opacity-60" style={{ backgroundColor: color }} />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:bg-card h-full ${className ?? ''}`}>
      <CardContent className="flex h-full items-start gap-4 p-5">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}15` }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          {loading ? (
            <>
              <Skeleton className="mb-1.5 h-7 w-20" />
              <Skeleton className="h-4 w-24" />
            </>
          ) : (
            <>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                {value ?? '--'}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
                {trend !== null && (
                  <TrendBadge value={trend} />
                )}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function TrendBadge({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Minus className="h-3 w-3" />
        0%
      </span>
    )
  }

  const isPositive = value > 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
        isPositive
          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
          : 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
      }`}
    >
      {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {isPositive ? '+' : ''}{value.toFixed(1)}%
    </span>
  )
}

function PlatformBadge({ connected }: { connected: boolean }) {
  return (
    <Badge
      variant={connected ? 'default' : 'outline'}
      className={`rounded-full text-[11px] ${
        connected
          ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-emerald-950/50'
          : 'border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500'
      }`}
    >
      <span
        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
          connected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      />
      {connected ? 'Verbunden' : 'Nicht verbunden'}
    </Badge>
  )
}

function NotConnectedCard({
  platformName,
  onConnect,
  connecting,
}: {
  platformName: string
  onConnect: () => void
  connecting: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800">
        <ExternalLink className="h-6 w-6 text-slate-300 dark:text-slate-600" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {platformName} ist nicht verbunden
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Verbinde diese Plattform in der Kundenverwaltung.
        </p>
      </div>
      <Button variant="outline" size="sm" className="rounded-xl" onClick={onConnect} disabled={connecting}>
        {connecting ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
        )}
        Verbinden
      </Button>
    </div>
  )
}

function PlatformErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/30">
        <AlertCircle className="h-6 w-6 text-red-500 dark:text-red-400" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Fehler beim Laden</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">{message}</p>
      </div>
      <Button variant="outline" size="sm" className="rounded-xl" onClick={onRetry}>
        <RefreshCw className="mr-2 h-3.5 w-3.5" />
        Erneut versuchen
      </Button>
    </div>
  )
}

function PlatformSkeleton() {
  return (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[180px] w-full rounded-xl" />
    </div>
  )
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
    </div>
  )
}

function PlatformInfoBanner({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'warning'
  children: React.ReactNode
}) {
  const toneClass =
    tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200'
      : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300'

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${toneClass}`}>
      {children}
    </div>
  )
}

function getPlatformPreview(key: string, state: PlatformState<unknown> | undefined): React.ReactNode {
  if (!state?.connected) return null
  if (state.loading) return <Skeleton className="h-3 w-20" />
  if (!state.data) return null
  const data = state.data
  switch (key) {
    case 'ga4': {
      const d = data as GA4Data
      return <>{formatNumber(d.sessions)} Sessions</>
    }
    case 'gsc': {
      const d = data as GSCData
      return <>{formatNumber(d.clicks)} Klicks</>
    }
    case 'googleAds': {
      const d = data as GoogleAdsData
      return <>{d.campaigns.filter((c) => c.status === 'ENABLED').length} Kampagnen · {formatCurrency(d.totalCost)}</>
    }
    case 'metaAds': {
      const d = data as MetaAdsData
      const reach = d.totalReach ?? d.campaigns.reduce((sum, c) => sum + c.reach, 0)
      return <>{formatNumber(reach)} Reach</>
    }
    case 'tiktok': {
      const d = data as TikTokData
      const views = d.totalVideoViews ?? d.campaigns.reduce((sum, c) => sum + (c.videoViews ?? c.views ?? 0), 0)
      return <>{formatNumber(views)} Views</>
    }
    default:
      return null
  }
}

function DashboardCustomerPickerCard({
  activeCustomerName,
  hasCustomers,
}: {
  activeCustomerName: string | null
  hasCustomers: boolean
}) {
  return (
    <Card className="rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:bg-card">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            Kunde für die Metriken
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {activeCustomerName
              ? `Aktuell ausgewählt: ${activeCustomerName}`
              : hasCustomers
                ? 'Wähle einen Kunden aus, dessen Marketing-Metriken du ansehen möchtest.'
                : 'Lege zuerst einen Kunden an, damit hier Metriken angezeigt werden können.'}
          </p>
        </div>
        <div className="sm:min-w-[280px]">
          <CustomerSelectorDropdown
            className="mx-0 my-0 w-full"
            triggerClassName="mx-0 my-0 w-full"
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// GA4 Section
// ---------------------------------------------------------------------------

function GA4Section({
  state,
  onRetry,
  onConnect,
  connecting,
}: {
  state: PlatformState<GA4Data>
  onRetry: () => void
  onConnect: () => void
  connecting: boolean
}) {
  if (!state.connected) {
    return (
      <NotConnectedCard
        platformName="Google Analytics 4"
        onConnect={onConnect}
        connecting={connecting}
      />
    )
  }
  if (state.loading) return <PlatformSkeleton />
  if (state.error) return <PlatformErrorState message={state.error} onRetry={onRetry} />
  if (!state.data) return <PlatformSkeleton />

  const d = state.data
  return (
    <div className="space-y-5 py-2">
      {d.isCached && (
        <PlatformInfoBanner tone="warning">
          Daten aus dem Cache
          {typeof d.cacheAgeMinutes === 'number' ? `, zuletzt vor ${d.cacheAgeMinutes} Min. aktualisiert.` : '.'}
        </PlatformInfoBanner>
      )}
      {d.message && !d.isCached && (
        <PlatformInfoBanner>{d.message}</PlatformInfoBanner>
      )}
      {d.timeseries.length > 0 ? (
        <TrendAreaChart
          title="Besucher im Zeitverlauf"
          data={d.timeseries}
          color="#f97316"
          type="area"
        />
      ) : (
        <PlatformInfoBanner>
          Fuer den gewaehlten Zeitraum sind noch keine GA4-Daten verfuegbar.
        </PlatformInfoBanner>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// GSC Section
// ---------------------------------------------------------------------------

function GSCSection({
  state,
  onRetry,
  onConnect,
  connecting,
}: {
  state: PlatformState<GSCData>
  onRetry: () => void
  onConnect: () => void
  connecting: boolean
}) {
  if (!state.connected) {
    return (
      <NotConnectedCard
        platformName="Google Search Console"
        onConnect={onConnect}
        connecting={connecting}
      />
    )
  }
  if (state.loading) return <PlatformSkeleton />
  if (state.error) return <PlatformErrorState message={state.error} onRetry={onRetry} />
  if (!state.data) return <PlatformSkeleton />

  const d = state.data
  return (
    <div className="space-y-5 py-2">
      {d.topKeywords.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Top Keywords</p>
          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Keyword</TableHead>
                  <TableHead className="text-right text-xs">Klicks</TableHead>
                  <TableHead className="text-right text-xs">Impressions</TableHead>
                  <TableHead className="text-right text-xs">CTR</TableHead>
                  <TableHead className="text-right text-xs">Position</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.topKeywords.map((kw) => (
                  <TableRow key={kw.keyword}>
                    <TableCell className="text-sm font-medium">{kw.keyword}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(kw.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(kw.impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPercent(kw.ctr)}</TableCell>
                    <TableCell className="text-right tabular-nums">{kw.position.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Google Ads Section
// ---------------------------------------------------------------------------

function GoogleAdsSection({
  state,
  onRetry,
  onConnect,
  connecting,
}: {
  state: PlatformState<GoogleAdsData>
  onRetry: () => void
  onConnect: () => void
  connecting: boolean
}) {
  if (!state.connected) {
    return (
      <NotConnectedCard
        platformName="Google Ads"
        onConnect={onConnect}
        connecting={connecting}
      />
    )
  }
  if (state.loading) return <PlatformSkeleton />
  if (state.error) return <PlatformErrorState message={state.error} onRetry={onRetry} />
  if (!state.data) return <PlatformSkeleton />

  const d = state.data
  const [showAll, setShowAll] = useState(false)
  const visibleCampaigns = showAll ? d.campaigns : d.campaigns.slice(0, 5)

  return (
    <div className="space-y-5 py-2">
      {d.campaigns.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <BarChart2 className="h-8 w-8 text-slate-200 dark:text-slate-700" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Keine Kampagnen im Zeitraum</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Kampagne</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-right text-xs">Budget</TableHead>
                  <TableHead className="text-right text-xs">Klicks</TableHead>
                  <TableHead className="text-right text-xs">Kosten</TableHead>
                  <TableHead className="text-right text-xs">Conversions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleCampaigns.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="text-sm font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'ENABLED' ? 'default' : 'outline'} className="rounded-full text-[11px]">
                        {c.status === 'ENABLED' ? 'Aktiv' : c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.budget)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(c.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(c.conversions)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {d.campaigns.length > 5 && (
            <Button variant="ghost" size="sm" className="w-full rounded-xl text-xs" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Weniger anzeigen' : `Alle ${d.campaigns.length} Kampagnen anzeigen`}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Meta Ads Section
// ---------------------------------------------------------------------------

function MetaAdsSection({
  state,
  onRetry,
  onConnect,
  connecting,
}: {
  state: PlatformState<MetaAdsData>
  onRetry: () => void
  onConnect: () => void
  connecting: boolean
}) {
  if (!state.connected) {
    return (
      <NotConnectedCard
        platformName="Meta Ads"
        onConnect={onConnect}
        connecting={connecting}
      />
    )
  }
  if (state.loading) return <PlatformSkeleton />
  if (state.error) return <PlatformErrorState message={state.error} onRetry={onRetry} />
  if (!state.data) return <PlatformSkeleton />

  const d = state.data
  const totalConversions =
    d.totalConversions ?? d.campaigns.reduce((sum, campaign) => sum + campaign.conversions, 0)
  const [showAll, setShowAll] = useState(false)
  const visibleCampaigns = showAll ? d.campaigns : d.campaigns.slice(0, 5)

  return (
    <div className="space-y-5 py-2">
      {d.campaigns.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <BarChart2 className="h-8 w-8 text-slate-200 dark:text-slate-700" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Keine Kampagnen im Zeitraum</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Kampagne</TableHead>
                  <TableHead className="text-right text-xs">Reichweite</TableHead>
                  <TableHead className="text-right text-xs">Impressions</TableHead>
                  <TableHead className="text-right text-xs">CPM</TableHead>
                  <TableHead className="text-right text-xs">Conversions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleCampaigns.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="text-sm font-medium">{c.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(c.reach)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(c.impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.cpm)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(c.conversions)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {d.campaigns.length > 5 && (
            <Button variant="ghost" size="sm" className="w-full rounded-xl text-xs" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Weniger anzeigen' : `Alle ${d.campaigns.length} Kampagnen anzeigen`}
            </Button>
          )}
        </>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Gesamt-Conversions im Zeitraum: {formatNumber(totalConversions)}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TikTok Ads Section
// ---------------------------------------------------------------------------

function TikTokSection({
  state,
  onRetry,
  onConnect,
  connecting,
}: {
  state: PlatformState<TikTokData>
  onRetry: () => void
  onConnect: () => void
  connecting: boolean
}) {
  if (!state.connected) {
    return (
      <NotConnectedCard
        platformName="TikTok Ads"
        onConnect={onConnect}
        connecting={connecting}
      />
    )
  }
  if (state.loading) return <PlatformSkeleton />
  if (state.error) return <PlatformErrorState message={state.error} onRetry={onRetry} />
  if (!state.data) return <PlatformSkeleton />

  const d = state.data
  const totalVideoViews =
    d.totalVideoViews ?? d.campaigns.reduce((sum, campaign) => sum + (campaign.videoViews ?? campaign.views ?? 0), 0)
  const totalClicks = d.totalClicks ?? d.campaigns.reduce((sum, campaign) => sum + campaign.clicks, 0)
  const totalCost = d.totalCost ?? d.campaigns.reduce((sum, campaign) => sum + campaign.cost, 0)
  const averageCpc =
    d.averageCpc ??
    (totalClicks > 0 ? totalCost / totalClicks : 0)
  const activeCampaigns =
    d.activeCampaigns ??
    d.campaigns.filter((campaign) => {
      const status = campaign.status?.toLowerCase()
      return !status || status === 'active' || status === 'enabled'
    }).length

  const [showAll, setShowAll] = useState(false)
  const visibleCampaigns = showAll ? d.campaigns : d.campaigns.slice(0, 5)

  return (
    <div className="space-y-5 py-2">
      {d.message && <PlatformInfoBanner>{d.message}</PlatformInfoBanner>}
      {d.isCached && (
        <PlatformInfoBanner tone="warning">
          TikTok-Daten werden aus dem Cache angezeigt
          {typeof d.cacheAgeMinutes === 'number' ? ` (${d.cacheAgeMinutes} Min. alt)` : ''}.
        </PlatformInfoBanner>
      )}

      {d.campaigns.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <BarChart2 className="h-8 w-8 text-slate-200 dark:text-slate-700" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Keine Kampagnen im Zeitraum</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Kampagne</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-right text-xs">Views</TableHead>
                  <TableHead className="text-right text-xs">Klicks</TableHead>
                  <TableHead className="text-right text-xs">CPC</TableHead>
                  <TableHead className="text-right text-xs">Kosten</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleCampaigns.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="text-sm font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                      {c.status ?? 'Aktiv'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(c.videoViews ?? c.views ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(c.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.cpc)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {d.campaigns.length > 5 && (
            <Button variant="ghost" size="sm" className="w-full rounded-xl text-xs" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Weniger anzeigen' : `Alle ${d.campaigns.length} Kampagnen anzeigen`}
            </Button>
          )}
        </>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Gesamt-Kosten im Zeitraum: {formatCurrency(totalCost)}
        {d.currency ? ` (${d.currency})` : ''}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Platform config
// ---------------------------------------------------------------------------

interface PlatformConfig {
  key: string
  label: string
  color: string
  iconBgClass: string
  textClass: string
}

const PLATFORMS: PlatformConfig[] = [
  { key: 'ga4', label: 'Google Analytics 4', color: '#f97316', iconBgClass: 'bg-orange-50 dark:bg-orange-950/30', textClass: 'text-orange-500' },
  { key: 'gsc', label: 'Google Search Console', color: '#3b82f6', iconBgClass: 'bg-blue-50 dark:bg-blue-950/30', textClass: 'text-blue-500' },
  { key: 'googleAds', label: 'Google Ads', color: '#22c55e', iconBgClass: 'bg-emerald-50 dark:bg-emerald-950/30', textClass: 'text-emerald-500' },
  { key: 'metaAds', label: 'Meta Ads', color: '#8b5cf6', iconBgClass: 'bg-violet-50 dark:bg-violet-950/30', textClass: 'text-violet-500' },
  { key: 'tiktok', label: 'TikTok Ads', color: '#ec4899', iconBgClass: 'bg-pink-50 dark:bg-pink-950/30', textClass: 'text-pink-500' },
]

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  ga4: <TrendingUp className="h-5 w-5 text-orange-500" />,
  gsc: <Search className="h-5 w-5 text-blue-500" />,
  googleAds: <MousePointerClick className="h-5 w-5 text-emerald-500" />,
  metaAds: <Eye className="h-5 w-5 text-violet-500" />,
  tiktok: <Zap className="h-5 w-5 text-pink-500" />,
}

// ---------------------------------------------------------------------------
// Main Workspace
// ---------------------------------------------------------------------------

interface MarketingDashboardWorkspaceProps {
  context: TenantShellContext
}

export function MarketingDashboardWorkspace({ context }: MarketingDashboardWorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeCustomer, customers, loading: customersLoading } = useActiveCustomer()

  // URL-driven date range
  const rangeParam = (searchParams.get('range') ?? '30d') as DateRange
  const range = (['today', '7d', '30d', '90d'] as DateRange[]).includes(rangeParam) ? rangeParam : '30d'

  // Platform states
  const [ga4, setGA4] = useState<PlatformState<GA4Data>>({ connected: false, loading: false, error: null, data: null, trend: null })
  const [gsc, setGSC] = useState<PlatformState<GSCData>>({ connected: false, loading: false, error: null, data: null, trend: null })
  const [googleAds, setGoogleAds] = useState<PlatformState<GoogleAdsData>>({ connected: false, loading: false, error: null, data: null, trend: null })
  const [metaAds, setMetaAds] = useState<PlatformState<MetaAdsData>>({ connected: false, loading: false, error: null, data: null, trend: null })
  const [tiktok, setTikTok] = useState<PlatformState<TikTokData>>({ connected: false, loading: false, error: null, data: null, trend: null })
  const [exporting, setExporting] = useState(false)
  const [detailCustomer, setDetailCustomer] = useState<CustomerDetailData | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [openingIntegrations, setOpeningIntegrations] = useState(false)
  const [openPlatforms, setOpenPlatforms] = useState<string[]>([])
  const [initializedFor, setInitializedFor] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const prevAnyLoadingRef = useRef(false)

  const platformStates: Record<string, PlatformState<unknown>> = {
    ga4, gsc, googleAds, metaAds, tiktok,
  }

  // Generic fetch per platform
  const fetchPlatform = useCallback(
    async <T,>(
      endpoint: string,
      customerId: string,
      dateRange: DateRange,
      setState: React.Dispatch<React.SetStateAction<PlatformState<T>>>
    ) => {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch(`${endpoint}?customerId=${customerId}&range=${dateRange}`, {
          credentials: 'include',
        })
        const json = await res.json()
        if (!res.ok) {
          throw new Error(
            typeof json.error === 'string'
              ? json.error
              : typeof json.message === 'string'
                ? json.message
                : `HTTP ${res.status}`
          )
        }
        setState({
          connected: json.connected ?? false,
          loading: false,
          error: null,
          data: json.data ?? null,
          trend: json.trend ?? null,
        })
      } catch (err) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Unbekannter Fehler',
        }))
      }
    },
    []
  )

  // Fetch all platforms in parallel
  const fetchAll = useCallback(
    (customerId: string, dateRange: DateRange) => {
      void fetchPlatform<GA4Data>('/api/tenant/dashboard/ga4', customerId, dateRange, setGA4)
      void fetchPlatform<GSCData>('/api/tenant/dashboard/gsc', customerId, dateRange, setGSC)
      void fetchPlatform<GoogleAdsData>('/api/tenant/dashboard/google-ads', customerId, dateRange, setGoogleAds)
      void fetchPlatform<MetaAdsData>('/api/tenant/dashboard/meta-ads', customerId, dateRange, setMetaAds)
      void fetchPlatform<TikTokData>('/api/tenant/dashboard/tiktok', customerId, dateRange, setTikTok)
    },
    [fetchPlatform]
  )

  // Fetch when customer or range changes
  useEffect(() => {
    if (!activeCustomer) return
    fetchAll(activeCustomer.id, range)
  }, [activeCustomer, range, fetchAll])

  useEffect(() => {
    if (!activeCustomer) return

    const refreshDashboard = (customerId?: string) => {
      if (customerId && customerId !== activeCustomer.id) return
      fetchAll(activeCustomer.id, range)
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== MARKETING_DASHBOARD_REFRESH_STORAGE_KEY) return
      const payload = readMarketingDashboardRefreshPayload(event.newValue)
      refreshDashboard(payload?.customerId)
    }

    const handleRefresh = (event: Event) => {
      const payload = event instanceof CustomEvent
        ? (event.detail as { customerId?: string } | undefined)
        : undefined
      refreshDashboard(payload?.customerId)
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener(MARKETING_DASHBOARD_REFRESH_EVENT, handleRefresh)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(MARKETING_DASHBOARD_REFRESH_EVENT, handleRefresh)
    }
  }, [activeCustomer, fetchAll, range])

  // Date range change handler
  const handleRangeChange = useCallback(
    (newRange: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('range', newRange)
      router.replace(`/dashboard?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  // PDF export via browser print
  const handleExport = useCallback(() => {
    setExporting(true)
    // Small delay so exporting state is visible, then trigger print
    setTimeout(() => {
      window.print()
      setExporting(false)
    }, 300)
  }, [])

  const fetchCustomerDetail = useCallback(async (customerId: string) => {
    const res = await fetch(`/api/tenant/customers/${customerId}`, {
      credentials: 'include',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(
        typeof data.error === 'string' ? data.error : 'Kunde konnte nicht geladen werden.'
      )
    }

    return data.customer as CustomerDetailData
  }, [])

  const handleOpenCustomerIntegrations = useCallback(async () => {
    if (!activeCustomer) return

    setOpeningIntegrations(true)
    try {
      const customer = await fetchCustomerDetail(activeCustomer.id)
      setDetailCustomer(customer)
      setDetailDialogOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunde konnte nicht geladen werden.')
    } finally {
      setOpeningIntegrations(false)
    }
  }, [activeCustomer, fetchCustomerDetail])

  const handleCloseCustomerIntegrations = useCallback(() => {
    setDetailDialogOpen(false)
    if (activeCustomer) {
      fetchAll(activeCustomer.id, range)
    }
  }, [activeCustomer, fetchAll, range])

  const handleCustomerDetailUpdate = useCallback(() => {
    if (!activeCustomer) return
    void fetchCustomerDetail(activeCustomer.id)
      .then((customer) => setDetailCustomer(customer))
      .catch(() => {})
    fetchAll(activeCustomer.id, range)
  }, [activeCustomer, fetchAll, fetchCustomerDetail, range])

  // Computed KPIs
  const kpis = useMemo(() => {
    // GA4
    const visitors: TrendValue = { value: ga4.data?.sessions ?? 0, trend: ga4.trend }
    const users: TrendValue = { value: ga4.data?.users ?? 0, trend: null }
    const pageviews: TrendValue = { value: ga4.data?.pageviews ?? 0, trend: null }
    const bounceRate: TrendValue = { value: ga4.data?.bounceRate ?? 0, trend: null }
    const avgSessionDuration: TrendValue = { value: ga4.data?.avgSessionDuration ?? 0, trend: null }
    const ga4Conversions: TrendValue = { value: ga4.data?.conversions ?? 0, trend: null }
    // GSC
    const gscImpressions: TrendValue = { value: gsc.data?.impressions ?? 0, trend: null }
    const gscClicks: TrendValue = { value: gsc.data?.clicks ?? 0, trend: null }
    const gscCtr: TrendValue = { value: gsc.data?.avgCtr ?? 0, trend: null }
    const gscPosition: TrendValue = { value: gsc.data?.avgPosition ?? 0, trend: null }
    // Ads
    const activeCampaigns = {
      value:
        (googleAds.data?.campaigns.filter((c) => c.status === 'ENABLED').length ?? 0) +
        (metaAds.data?.campaigns.length ?? 0) +
        (tiktok.data?.activeCampaigns ?? tiktok.data?.campaigns.length ?? 0),
      trend: null,
    }
    const avgCpc: TrendValue = { value: googleAds.data?.avgCpc ?? 0, trend: null }
    const avgCpm: TrendValue = { value: metaAds.data?.avgCpm ?? 0, trend: null }
    const conversions: TrendValue = { value: googleAds.data?.totalConversions ?? 0, trend: null }
    const totalSpend: TrendValue = {
      value:
        (googleAds.data?.totalCost ?? 0) +
        (metaAds.data?.totalCost ?? 0) +
        (tiktok.data?.totalCost ?? 0),
      trend: null,
    }
    const tikTokViews: TrendValue = { value: tiktok.data?.totalVideoViews ?? 0, trend: null }
    return {
      visitors, users, pageviews, bounceRate, avgSessionDuration, ga4Conversions,
      gscImpressions, gscClicks, gscCtr, gscPosition,
      activeCampaigns, avgCpc, avgCpm, conversions, totalSpend, tikTokViews,
    }
  }, [ga4, gsc, googleAds, metaAds, tiktok])

  const anyLoading = ga4.loading || gsc.loading || googleAds.loading || metaAds.loading || tiktok.loading
  const allNotConnected = !ga4.connected && !gsc.connected && !googleAds.connected && !metaAds.connected && !tiktok.connected
  const hasAnyData = ga4.connected || gsc.connected || googleAds.connected || metaAds.connected || tiktok.connected

  // Determine connected platforms for accordion default open
  const connectedKeys = PLATFORMS.filter((p) => platformStates[p.key]?.connected).map((p) => p.key)

  // Auto-open connected platforms on first load per customer
  useEffect(() => {
    if (!anyLoading && activeCustomer && initializedFor !== activeCustomer.id && connectedKeys.length > 0) {
      setOpenPlatforms(connectedKeys)
      setInitializedFor(activeCustomer.id)
    }
  }, [anyLoading, activeCustomer, connectedKeys, initializedFor])

  // Reset accordion when customer changes
  useEffect(() => {
    if (activeCustomer && initializedFor && initializedFor !== activeCustomer.id) {
      setOpenPlatforms([])
    }
  }, [activeCustomer, initializedFor])

  // Track last refresh time: set when loading goes from true → false
  useEffect(() => {
    if (prevAnyLoadingRef.current && !anyLoading) {
      setLastRefreshed(new Date())
    }
    prevAnyLoadingRef.current = anyLoading
  }, [anyLoading])

  const handleManualRefresh = useCallback(() => {
    if (!activeCustomer) return
    fetchAll(activeCustomer.id, range)
  }, [activeCustomer, fetchAll, range])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // No customers at all
  if (!customersLoading && customers.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Marketing Dashboard</h1>
        <DashboardCustomerPickerCard activeCustomerName={null} hasCustomers={false} />
        <Card className="rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:bg-card">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50">
              <Users2 className="h-7 w-7 text-blue-500 dark:text-blue-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">
                Noch keine Kunden vorhanden
              </h2>
              <p className="max-w-md text-sm leading-7 text-slate-600 dark:text-slate-400">
                Lege deinen ersten Kunden an, um das Marketing Performance Dashboard nutzen zu
                können.
              </p>
            </div>
            <Button asChild className="rounded-xl">
              <Link href="/tools/customers">Ersten Kunden anlegen</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // No customer selected
  if (!activeCustomer) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Marketing Dashboard</h1>
        <DashboardCustomerPickerCard activeCustomerName={null} hasCustomers={customers.length > 0} />
        <NoCustomerSelected toolName="Marketing Performance" />
      </div>
    )
  }

  return (
    <div className="print-area space-y-6 print:space-y-4">
      {/* Print-only header */}
      <div className="hidden print:block">
        <div className="mb-4 border-b pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{context.tenant.name}</h1>
              <p className="text-sm text-slate-500">Marketing Performance Bericht</p>
            </div>
            <div className="text-right text-sm text-slate-500">
              <p>Kunde: {activeCustomer.name}</p>
              <p>Zeitraum: {DATE_RANGE_LABELS[range]}</p>
              <p>Erstellt: {new Date().toLocaleDateString('de-DE')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Marketing Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Performance-Übersicht · <span className="font-medium text-slate-700 dark:text-slate-200">{activeCustomer.name}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden min-w-[280px] lg:block">
            <CustomerSelectorDropdown
              className="mx-0 my-0 w-full"
              triggerClassName="mx-0 my-0 w-full"
              compact
            />
          </div>
          <Tabs value={range} onValueChange={handleRangeChange}>
            <TabsList className="h-9 rounded-xl">
              {(Object.entries(DATE_RANGE_TAB_LABELS) as [DateRange, string][]).map(([key, label]) => (
                <TabsTrigger key={key} value={key} className="rounded-lg px-3 text-xs">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {lastRefreshed && (
            <span className="hidden text-xs text-slate-400 dark:text-slate-500 lg:inline">
              {lastRefreshed.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-xl"
                onClick={handleManualRefresh}
                disabled={anyLoading}
              >
                {anyLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Daten aktualisieren</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={handleExport}
                disabled={exporting || anyLoading}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin lg:mr-2" />
                ) : (
                  <Download className="h-4 w-4 lg:mr-2" />
                )}
                <span className="hidden lg:inline">Bericht exportieren</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>PDF-Bericht via Browser-Druck erstellen</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="print:hidden lg:hidden">
        <DashboardCustomerPickerCard
          activeCustomerName={activeCustomer.name}
          hasCustomers={customers.length > 0}
        />
      </div>

      {/* All integrations missing hint */}
      {!anyLoading && allNotConnected && (
        <Card className="rounded-2xl border border-amber-200 bg-amber-50 shadow-none dark:border-amber-900/50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-4 p-5">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Keine Integrationen verbunden
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Verbinde Plattformen direkt im Kunden-Modal, um Marketing-Daten anzuzeigen.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={handleOpenCustomerIntegrations}
              disabled={openingIntegrations}
            >
              {openingIntegrations ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Integrationen öffnen
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI Sections */}
      <div className="space-y-4 print:space-y-3">
        {/* Website Performance (GA4) */}
        {(ga4.loading || ga4.connected) && (
          <div>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <TrendingUp className="h-3.5 w-3.5 text-orange-400" />
              Website · Google Analytics 4
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:auto-rows-[160px] print:grid-cols-5">
              <KPICard
                label="Seitenaufrufe"
                value={ga4.loading ? null : formatNumber(kpis.pageviews.value)}
                trend={null}
                icon={<Eye className="h-6 w-6 text-orange-500" />}
                loading={ga4.loading}
                color="#f97316"
                size="featured"
                className="col-span-2 sm:row-span-2"
                timeseries={range !== 'today' ? (ga4.data?.timeseries ?? undefined) : undefined}
              />
              <KPICard
                label="Nutzer"
                value={ga4.loading ? null : formatNumber(kpis.users.value)}
                trend={null}
                icon={<UserCheck className="h-5 w-5 text-orange-400" />}
                loading={ga4.loading}
                color="#fb923c"
              />
              <KPICard
                label="Conversions"
                value={ga4.loading ? null : formatNumber(kpis.ga4Conversions.value)}
                trend={null}
                icon={<TrendingUp className="h-5 w-5 text-amber-500" />}
                loading={ga4.loading}
                color="#f59e0b"
              />
              <KPICard
                label="Absprungrate"
                value={ga4.loading ? null : formatPercent(kpis.bounceRate.value)}
                trend={null}
                icon={<Activity className="h-5 w-5 text-orange-400" />}
                loading={ga4.loading}
                color="#f97316"
              />
              <KPICard
                label="Verweildauer"
                value={ga4.loading ? null : formatDuration(kpis.avgSessionDuration.value)}
                trend={null}
                icon={<TrendingUp className="h-5 w-5 text-orange-500" />}
                loading={ga4.loading}
                color="#ea580c"
              />
            </div>
          </div>
        )}

        {/* Search Performance (GSC) */}
        {(gsc.loading || gsc.connected) && (
          <div>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <Search className="h-3.5 w-3.5 text-blue-400" />
              Suche · Google Search Console
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:auto-rows-[160px] print:grid-cols-4">
              <KPICard
                label="Impressions"
                value={gsc.loading ? null : formatNumber(kpis.gscImpressions.value)}
                trend={null}
                icon={<Eye className="h-6 w-6 text-blue-500" />}
                loading={gsc.loading}
                color="#3b82f6"
                size="featured"
                className="col-span-2 sm:row-span-2"
                timeseries={range !== 'today' ? (gsc.data?.timeseries ?? undefined) : undefined}
              />
              <KPICard
                label="Klicks"
                value={gsc.loading ? null : formatNumber(kpis.gscClicks.value)}
                trend={null}
                icon={<MousePointerClick className="h-5 w-5 text-blue-500" />}
                loading={gsc.loading}
                color="#2563eb"
              />
              <KPICard
                label="CTR"
                value={gsc.loading ? null : formatPercent(kpis.gscCtr.value)}
                trend={null}
                icon={<TrendingUp className="h-5 w-5 text-blue-400" />}
                loading={gsc.loading}
                color="#60a5fa"
              />
              <KPICard
                label="Ø Position"
                value={gsc.loading ? null : kpis.gscPosition.value.toFixed(1)}
                trend={null}
                icon={<Search className="h-5 w-5 text-blue-500" />}
                loading={gsc.loading}
                color="#3b82f6"
                className="col-span-2"
              />
            </div>
          </div>
        )}

        {/* Paid Ads */}
        {(googleAds.loading || googleAds.connected || metaAds.loading || metaAds.connected || tiktok.loading || tiktok.connected) && (
        <div>
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <Zap className="h-3.5 w-3.5 text-emerald-400" />
            Kampagnen
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:auto-rows-[160px] print:grid-cols-5">
            <KPICard
              label="Aktive Kampagnen"
              value={anyLoading ? null : formatNumber(kpis.activeCampaigns.value)}
              trend={null}
              icon={<Zap className="h-5 w-5 text-blue-500" />}
              loading={googleAds.loading || metaAds.loading || tiktok.loading}
              color="#3b82f6"
            />
            <KPICard
              label="Gesamtausgaben"
              value={anyLoading ? null : formatCurrency(kpis.totalSpend.value)}
              trend={null}
              icon={<Wallet className="h-6 w-6 text-red-500" />}
              loading={googleAds.loading || metaAds.loading || tiktok.loading}
              color="#ef4444"
              size="featured"
              className="col-span-2 sm:row-span-2"
            />
            <KPICard
              label="Conversions"
              value={anyLoading ? null : formatNumber(kpis.conversions.value)}
              trend={null}
              icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
              loading={googleAds.loading}
              color="#16a34a"
            />
            <KPICard
              label="Avg. CPC"
              value={anyLoading ? null : formatCurrency(kpis.avgCpc.value)}
              trend={null}
              icon={<MousePointerClick className="h-5 w-5 text-emerald-500" />}
              loading={googleAds.loading}
              color="#22c55e"
            />
            <KPICard
              label="Avg. CPM"
              value={anyLoading ? null : formatCurrency(kpis.avgCpm.value)}
              trend={null}
              icon={<Eye className="h-5 w-5 text-violet-500" />}
              loading={metaAds.loading}
              color="#8b5cf6"
              className="col-span-2"
            />
          </div>
        </div>
        )}

        {/* TikTok summary (only if connected) */}
        {(tiktok.loading || tiktok.connected) && tiktok.data && tiktok.data.totalVideoViews && tiktok.data.totalVideoViews > 0 && (
          <div>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <Zap className="h-3.5 w-3.5 text-pink-400" />
              TikTok Ads
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:auto-rows-[160px] print:grid-cols-4">
              <KPICard
                label="Video Views"
                value={tiktok.loading ? null : formatNumber(kpis.tikTokViews.value)}
                trend={null}
                icon={<Eye className="h-6 w-6 text-pink-500" />}
                loading={tiktok.loading}
                color="#ec4899"
                size="featured"
                className="col-span-2 sm:row-span-2"
              />
              <KPICard
                label="Klicks"
                value={tiktok.loading ? null : formatNumber(tiktok.data?.totalClicks ?? 0)}
                trend={null}
                icon={<MousePointerClick className="h-5 w-5 text-pink-500" />}
                loading={tiktok.loading}
                color="#ec4899"
              />
              <KPICard
                label="Avg. CPC"
                value={tiktok.loading ? null : formatCurrency(tiktok.data?.averageCpc ?? 0)}
                trend={null}
                icon={<Wallet className="h-5 w-5 text-pink-400" />}
                loading={tiktok.loading}
                color="#ec4899"
              />
              <KPICard
                label="Gesamtkosten"
                value={tiktok.loading ? null : formatCurrency(tiktok.data?.totalCost ?? 0)}
                trend={null}
                icon={<Zap className="h-5 w-5 text-pink-500" />}
                loading={tiktok.loading}
                color="#ec4899"
                className="col-span-2"
              />
            </div>
          </div>
        )}
      </div>

      {/* Platform Sections */}
      {hasAnyData && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 rounded-lg px-2 text-xs text-slate-500"
            onClick={() => setOpenPlatforms(PLATFORMS.map((p) => p.key))}
          >
            <ChevronsUpDown className="mr-1 h-3.5 w-3.5" />
            Alle aufklappen
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 rounded-lg px-2 text-xs text-slate-500"
            onClick={() => setOpenPlatforms([])}
          >
            <ChevronsDownUp className="mr-1 h-3.5 w-3.5" />
            Alle einklappen
          </Button>
        </div>
      )}
      <Accordion
        type="multiple"
        value={openPlatforms}
        onValueChange={setOpenPlatforms}
        className="space-y-3"
      >
        {PLATFORMS.map((platform) => {
          const state = platformStates[platform.key]
          const isConnected = state?.connected ?? false
          const preview = getPlatformPreview(platform.key, state as PlatformState<unknown>)
          return (
            <AccordionItem
              key={platform.key}
              value={platform.key}
              className={`rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:bg-card print:break-inside-avoid transition-opacity ${!isConnected ? 'opacity-60' : ''}`}
            >
              <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]>div>.chevron]:rotate-180">
                <div className="flex w-full min-w-0 items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${platform.iconBgClass} ${!isConnected ? 'grayscale' : ''}`}>
                    {PLATFORM_ICONS[platform.key]}
                  </div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {platform.label}
                  </span>
                  <PlatformBadge connected={isConnected} />
                  {preview && (
                    <span className="ml-auto shrink-0 pr-2 text-xs tabular-nums text-slate-400 dark:text-slate-500">
                      {preview}
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5">
                {platform.key === 'ga4' && (
                  <GA4Section
                    state={ga4}
                    onRetry={() => activeCustomer && fetchPlatform<GA4Data>('/api/tenant/dashboard/ga4', activeCustomer.id, range, setGA4)}
                    onConnect={handleOpenCustomerIntegrations}
                    connecting={openingIntegrations}
                  />
                )}
                {platform.key === 'gsc' && (
                  <GSCSection
                    state={gsc}
                    onRetry={() => activeCustomer && fetchPlatform<GSCData>('/api/tenant/dashboard/gsc', activeCustomer.id, range, setGSC)}
                    onConnect={handleOpenCustomerIntegrations}
                    connecting={openingIntegrations}
                  />
                )}
                {platform.key === 'googleAds' && (
                  <GoogleAdsSection
                    state={googleAds}
                    onRetry={() => activeCustomer && fetchPlatform<GoogleAdsData>('/api/tenant/dashboard/google-ads', activeCustomer.id, range, setGoogleAds)}
                    onConnect={handleOpenCustomerIntegrations}
                    connecting={openingIntegrations}
                  />
                )}
                {platform.key === 'metaAds' && (
                  <MetaAdsSection
                    state={metaAds}
                    onRetry={() => activeCustomer && fetchPlatform<MetaAdsData>('/api/tenant/dashboard/meta-ads', activeCustomer.id, range, setMetaAds)}
                    onConnect={handleOpenCustomerIntegrations}
                    connecting={openingIntegrations}
                  />
                )}
                {platform.key === 'tiktok' && (
                  <TikTokSection
                    state={tiktok}
                    onRetry={() => activeCustomer && fetchPlatform<TikTokData>('/api/tenant/dashboard/tiktok', activeCustomer.id, range, setTikTok)}
                    onConnect={handleOpenCustomerIntegrations}
                    connecting={openingIntegrations}
                  />
                )}
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>

      {/* Print-only footer */}
      <div className="hidden print:block">
        <div className="mt-6 border-t pt-4 text-xs text-slate-400">
          <div className="flex items-center justify-between">
            <p>
              Erstellt am {new Date().toLocaleDateString('de-DE')} um{' '}
              {new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p>{context.tenant.name}</p>
          </div>
          {!allNotConnected && (
            <p className="mt-1">
              {PLATFORMS.filter((p) => !platformStates[p.key]?.connected).length > 0 && (
                <>
                  {PLATFORMS.filter((p) => !platformStates[p.key]?.connected).length} Integration(en)
                  nicht verbunden:{' '}
                  {PLATFORMS.filter((p) => !platformStates[p.key]?.connected)
                    .map((p) => p.label)
                    .join(', ')}
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {detailCustomer && (
        <CustomerDetailWorkspace
          customer={detailCustomer}
          open={detailDialogOpen}
          onClose={handleCloseCustomerIntegrations}
          isAdmin={context.membership.role === 'admin'}
          onUpdate={handleCustomerDetailUpdate}
          initialTab="integrations"
        />
      )}
    </div>
  )
}
