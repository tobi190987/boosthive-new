'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  Minus,
  MousePointerClick,
  RefreshCw,
  Search,
  TrendingUp,
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
}

function KPICard({ label, value, trend, icon, loading, color }: KPICardProps) {
  return (
    <Card className="rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:bg-card">
      <CardContent className="flex items-start gap-4 p-5">
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
      {(d.googleEmail || d.propertyName) && (
        <div className="grid gap-3 md:grid-cols-2">
          {d.googleEmail && (
            <PlatformInfoBanner>
              <span className="font-medium">Google-Konto:</span> {d.googleEmail}
            </PlatformInfoBanner>
          )}
          {d.propertyName && (
            <PlatformInfoBanner>
              <span className="font-medium">Property:</span> {d.propertyName}
              {d.propertyId ? ` (${d.propertyId})` : ''}
            </PlatformInfoBanner>
          )}
        </div>
      )}
      {d.isCached && (
        <PlatformInfoBanner tone="warning">
          Daten aus dem Cache
          {typeof d.cacheAgeMinutes === 'number' ? `, zuletzt vor ${d.cacheAgeMinutes} Min. aktualisiert.` : '.'}
        </PlatformInfoBanner>
      )}
      {d.message && !d.isCached && (
        <PlatformInfoBanner>{d.message}</PlatformInfoBanner>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <MetricItem label="Sessions" value={formatNumber(d.sessions)} />
        <MetricItem label="Nutzer" value={formatNumber(d.users)} />
        <MetricItem label="Seitenaufrufe" value={formatNumber(d.pageviews)} />
        <MetricItem label="Absprungrate" value={formatPercent(d.bounceRate)} />
        <MetricItem label="Verweildauer" value={formatDuration(d.avgSessionDuration)} />
      </div>
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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricItem label="Impressions" value={formatNumber(d.impressions)} />
        <MetricItem label="Klicks" value={formatNumber(d.clicks)} />
        <MetricItem label="CTR" value={formatPercent(d.avgCtr)} />
        <MetricItem label="Position" value={d.avgPosition.toFixed(1)} />
      </div>
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
  return (
    <div className="space-y-5 py-2">
      {d.campaigns.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">Keine aktiven Kampagnen</p>
      ) : (
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
              {d.campaigns.map((c) => (
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
  const totalReach = d.totalReach ?? d.campaigns.reduce((sum, campaign) => sum + campaign.reach, 0)
  const totalImpressions =
    d.totalImpressions ?? d.campaigns.reduce((sum, campaign) => sum + campaign.impressions, 0)
  const totalConversions =
    d.totalConversions ?? d.campaigns.reduce((sum, campaign) => sum + campaign.conversions, 0)
  const currencyLabel = d.currency ?? 'EUR'

  return (
    <div className="space-y-5 py-2">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-border dark:bg-slate-900/40">
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Gesamt-Reichweite</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatNumber(totalReach)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-border dark:bg-slate-900/40">
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Impressions</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatNumber(totalImpressions)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-border dark:bg-slate-900/40">
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Durchschnittlicher CPM</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(d.avgCpm)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-border dark:bg-slate-900/40">
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Gesamtausgaben</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(d.totalCost)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Waehrung: {currencyLabel}
          </p>
        </div>
      </div>

      {d.campaigns.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">Keine aktiven Kampagnen</p>
      ) : (
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
              {d.campaigns.map((c) => (
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

  return (
    <div className="space-y-5 py-2">
      {d.message && <PlatformInfoBanner>{d.message}</PlatformInfoBanner>}
      {d.isCached && (
        <PlatformInfoBanner tone="warning">
          TikTok-Daten werden aus dem Cache angezeigt
          {typeof d.cacheAgeMinutes === 'number' ? ` (${d.cacheAgeMinutes} Min. alt)` : ''}.
        </PlatformInfoBanner>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricItem label="Aktive Kampagnen" value={formatNumber(activeCampaigns)} />
        <MetricItem label="Video Views" value={formatNumber(totalVideoViews)} />
        <MetricItem label="Klicks" value={formatNumber(totalClicks)} />
        <MetricItem label="Avg. CPC" value={formatCurrency(averageCpc)} />
      </div>

      {d.campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center dark:border-slate-800">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Keine TikTok-Kampagnen im gewaehlten Zeitraum
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Sobald ein Advertiser verbunden ist und Daten liefert, erscheinen hier Kampagnen, Views und Kosten.
          </p>
        </div>
      ) : (
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
              {d.campaigns.map((c) => (
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
    const visitors: TrendValue = {
      value: ga4.data?.sessions ?? 0,
      trend: ga4.trend,
    }
    const activeCampaigns = {
      value:
        (googleAds.data?.campaigns.filter((c) => c.status === 'ENABLED').length ?? 0) +
        (metaAds.data?.campaigns.length ?? 0) +
        (tiktok.data?.activeCampaigns ?? tiktok.data?.campaigns.length ?? 0),
      trend: null,
    }
    const avgCpc: TrendValue = {
      value: googleAds.data?.avgCpc ?? 0,
      trend: null,
    }
    const avgCpm: TrendValue = {
      value: metaAds.data?.avgCpm ?? 0,
      trend: null,
    }
    const conversions: TrendValue = {
      value: (googleAds.data?.totalConversions ?? 0),
      trend: null,
    }
    const totalSpend: TrendValue = {
      value:
        (googleAds.data?.totalCost ?? 0) +
        (metaAds.data?.totalCost ?? 0) +
        (tiktok.data?.totalCost ?? 0),
      trend: null,
    }
    return { visitors, activeCampaigns, avgCpc, avgCpm, conversions, totalSpend }
  }, [ga4, googleAds, metaAds, tiktok])

  const anyLoading = ga4.loading || gsc.loading || googleAds.loading || metaAds.loading || tiktok.loading
  const allNotConnected = !ga4.connected && !gsc.connected && !googleAds.connected && !metaAds.connected && !tiktok.connected
  const hasAnyData = ga4.connected || gsc.connected || googleAds.connected || metaAds.connected || tiktok.connected

  // Determine connected platforms for accordion default open
  const connectedKeys = PLATFORMS.filter((p) => platformStates[p.key]?.connected).map((p) => p.key)

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
    <div className="space-y-6 print:space-y-4">
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
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Marketing Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Performance-Übersicht für <span className="font-medium text-slate-700 dark:text-slate-200">{activeCustomer.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden min-w-[280px] lg:block">
            <CustomerSelectorDropdown
              className="mx-0 my-0 w-full"
              triggerClassName="mx-0 my-0 w-full"
              compact
            />
          </div>
          <Tabs value={range} onValueChange={handleRangeChange}>
            <TabsList className="h-9 rounded-xl">
              {(Object.entries(DATE_RANGE_LABELS) as [DateRange, string][]).map(([key, label]) => (
                <TabsTrigger key={key} value={key} className="rounded-lg px-3 text-xs">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Bericht exportieren
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

      {/* Global KPI Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6 print:grid-cols-3">
        <KPICard
          label="Besucher"
          value={anyLoading ? null : formatNumber(kpis.visitors.value)}
          trend={kpis.visitors.trend}
          icon={<Users2 className="h-5 w-5 text-orange-500" />}
          loading={ga4.loading}
          color="#f97316"
        />
        <KPICard
          label="Aktive Kampagnen"
          value={anyLoading ? null : formatNumber(kpis.activeCampaigns.value)}
          trend={kpis.activeCampaigns.trend}
          icon={<Zap className="h-5 w-5 text-blue-500" />}
          loading={googleAds.loading || metaAds.loading || tiktok.loading}
          color="#3b82f6"
        />
        <KPICard
          label="Avg. CPC"
          value={anyLoading ? null : formatCurrency(kpis.avgCpc.value)}
          trend={kpis.avgCpc.trend}
          icon={<MousePointerClick className="h-5 w-5 text-emerald-500" />}
          loading={googleAds.loading}
          color="#22c55e"
        />
        <KPICard
          label="Avg. CPM"
          value={anyLoading ? null : formatCurrency(kpis.avgCpm.value)}
          trend={kpis.avgCpm.trend}
          icon={<Eye className="h-5 w-5 text-violet-500" />}
          loading={metaAds.loading}
          color="#8b5cf6"
        />
        <KPICard
          label="Conversions"
          value={anyLoading ? null : formatNumber(kpis.conversions.value)}
          trend={kpis.conversions.trend}
          icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
          loading={googleAds.loading || ga4.loading}
          color="#16a34a"
        />
        <KPICard
          label="Gesamtausgaben"
          value={anyLoading ? null : formatCurrency(kpis.totalSpend.value)}
          trend={kpis.totalSpend.trend}
          icon={<Wallet className="h-5 w-5 text-red-500" />}
          loading={googleAds.loading || metaAds.loading || tiktok.loading}
          color="#ef4444"
        />
      </div>

      {/* Platform Sections */}
      <Accordion
        type="multiple"
        defaultValue={connectedKeys}
        className="space-y-3"
      >
        {PLATFORMS.map((platform) => {
          const state = platformStates[platform.key]
          return (
            <AccordionItem
              key={platform.key}
              value={platform.key}
              className="rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:bg-card print:break-inside-avoid"
            >
              <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]>div>.chevron]:rotate-180">
                <div className="flex w-full items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${platform.iconBgClass}`}>
                    {PLATFORM_ICONS[platform.key]}
                  </div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {platform.label}
                  </span>
                  <PlatformBadge connected={state?.connected ?? false} />
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
