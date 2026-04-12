'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowDownRight, ArrowUpRight, Loader2, Minus } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PortalEmptySection } from '@/components/portal-shell'

interface MetricCard {
  label: string
  value: string
  trend: number | null // percentage, positive = up
}

interface TopKeyword {
  keyword: string
  position: number
  clicks: number
  impressions: number
}

interface AdCampaign {
  name: string
  platform: string
  spend: number
  roas: number | null
  currency: string
}

interface PortalDashboardData {
  ga4?: {
    sessions: MetricCard
    users: MetricCard
    pageviews: MetricCard
  } | null
  ads?: {
    totalSpend: number
    currency: string
    campaigns: AdCampaign[]
  } | null
  seo?: {
    avgPosition: MetricCard
    topKeywords: TopKeyword[]
  } | null
  visibility: {
    show_ga4: boolean
    show_ads: boolean
    show_seo: boolean
  }
}

function TrendIcon({ value }: { value: number | null }) {
  if (value === null) return null
  if (value > 0) return <ArrowUpRight className="h-3.5 w-3.5 text-green-600" />
  if (value < 0) return <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
  return <Minus className="h-3.5 w-3.5 text-slate-400" />
}

function MetricCardUI({ label, value, trend }: MetricCard) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
        {trend !== null && (
          <div className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : 'text-slate-400'}`}>
            <TrendIcon value={trend} />
            {trend > 0 ? '+' : ''}{trend.toFixed(1)}% vs. Vorperiode
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function PortalDashboardWorkspace() {
  const router = useRouter()
  const [data, setData] = useState<PortalDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/dashboard')
      if (res.status === 401) {
        router.replace('/portal/login')
        return
      }
      if (!res.ok) throw new Error('Daten konnten nicht geladen werden.')
      const json = await res.json() as PortalDashboardData
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert className="rounded-xl border-red-200 bg-red-50 text-red-700">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Aktuelle Marketing-Metriken auf einen Blick.</p>
      </div>

      {/* GA4 */}
      {data.visibility.show_ga4 && (
        <section aria-label="Traffic-Metriken">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Traffic (GA4)</h2>
          {data.ga4 ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCardUI {...data.ga4.sessions} />
              <MetricCardUI {...data.ga4.users} />
              <MetricCardUI {...data.ga4.pageviews} />
            </div>
          ) : (
            <PortalEmptySection label="GA4 noch nicht verbunden" />
          )}
        </section>
      )}

      {/* Ads */}
      {data.visibility.show_ads && (
        <section aria-label="Ads-Kampagnen">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Aktive Kampagnen</h2>
          {data.ads && data.ads.campaigns.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Gesamtausgaben: {data.ads.totalSpend.toLocaleString('de-DE', { style: 'currency', currency: data.ads.currency })}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kampagne</TableHead>
                      <TableHead>Plattform</TableHead>
                      <TableHead className="text-right">Ausgaben</TableHead>
                      <TableHead className="text-right">ROAS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.ads.campaigns.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{c.platform}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {c.spend.toLocaleString('de-DE', { style: 'currency', currency: c.currency })}
                        </TableCell>
                        <TableCell className="text-right">
                          {c.roas !== null ? `${c.roas.toFixed(2)}x` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <PortalEmptySection label="Keine aktiven Kampagnen" />
          )}
        </section>
      )}

      {/* SEO */}
      {data.visibility.show_seo && (
        <section aria-label="SEO-Rankings">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">SEO-Rankings (GSC)</h2>
          {data.seo && data.seo.topKeywords.length > 0 ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-1 max-w-xs">
                <MetricCardUI {...data.seo.avgPosition} />
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Top-Keywords</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Keyword</TableHead>
                        <TableHead className="text-right">Position</TableHead>
                        <TableHead className="text-right">Klicks</TableHead>
                        <TableHead className="text-right">Impressionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.seo.topKeywords.slice(0, 10).map((kw, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{kw.keyword}</TableCell>
                          <TableCell className="text-right">{kw.position.toFixed(1)}</TableCell>
                          <TableCell className="text-right">{kw.clicks.toLocaleString('de-DE')}</TableCell>
                          <TableCell className="text-right">{kw.impressions.toLocaleString('de-DE')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          ) : (
            <PortalEmptySection label="GSC noch nicht verbunden" />
          )}
        </section>
      )}
    </div>
  )
}
