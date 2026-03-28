'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  Building2,
  CreditCard,
  DollarSign,
  ExternalLink,
  Loader2,
  Lock,
  Search,
  Shield,
  Unlock,
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface BillingMetrics {
  active: number
  pastDue: number
  canceling: number
  manualLocked: number
}

type SubscriptionFilter = 'all' | 'active' | 'past_due' | 'canceling' | 'canceled' | 'none'
type AccessFilter = 'all' | 'accessible' | 'manual_locked' | 'billing_blocked'

interface TenantBillingRecord {
  id: string
  name: string
  slug: string
  tenantStatus: string
  subscriptionStatus: string
  moduleCount: number
  nextBillingAt: string | null
  totalAmount: number
  currency: string
  accessState: string
}

interface PaginationState {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 20

function parseSubscriptionFilter(value: string | null): SubscriptionFilter {
  const valid: SubscriptionFilter[] = ['all', 'active', 'past_due', 'canceling', 'canceled', 'none']
  return valid.includes(value as SubscriptionFilter) ? (value as SubscriptionFilter) : 'all'
}

function parseAccessFilter(value: string | null): AccessFilter {
  const valid: AccessFilter[] = ['all', 'accessible', 'manual_locked', 'billing_blocked']
  return valid.includes(value as AccessFilter) ? (value as AccessFilter) : 'all'
}

function parsePage(value: string | null) {
  const parsed = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function formatDate(value: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date)
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

function subscriptionBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="rounded-full bg-[#edf8f6] text-[#0d9488] hover:bg-[#edf8f6]">Aktiv</Badge>
    case 'past_due':
      return <Badge className="rounded-full bg-[#fef2f2] text-[#dc2626] hover:bg-[#fef2f2]">Ueberfaellig</Badge>
    case 'canceling':
      return <Badge className="rounded-full bg-[#fff8ed] text-[#b85e34] hover:bg-[#fff8ed]">In Kuendigung</Badge>
    case 'canceled':
      return <Badge className="rounded-full bg-[#f1f5f9] text-[#64748b] hover:bg-[#f1f5f9]">Gekuendigt</Badge>
    default:
      return <Badge className="rounded-full bg-[#f1f5f9] text-[#94a3b8] hover:bg-[#f1f5f9]">Kein Abo</Badge>
  }
}

function accessBadge(state: string) {
  switch (state) {
    case 'accessible':
      return <Badge className="rounded-full bg-[#edf8f6] text-[#0d9488] hover:bg-[#edf8f6]">Zugang aktiv</Badge>
    case 'manual_locked':
      return <Badge className="rounded-full bg-[#fef2f2] text-[#dc2626] hover:bg-[#fef2f2]">Gesperrt</Badge>
    case 'billing_blocked':
      return <Badge className="rounded-full bg-[#fff8ed] text-[#b85e34] hover:bg-[#fff8ed]">Billing-Block</Badge>
    default:
      return <Badge className="rounded-full bg-[#f1f5f9] text-[#94a3b8] hover:bg-[#f1f5f9]">{state}</Badge>
  }
}

/* -------------------------------------------------------------------------- */
/*  Metrics Row                                                               */
/* -------------------------------------------------------------------------- */

function BillingMetricsRow({ metrics }: { metrics: BillingMetrics }) {
  const items = [
    {
      label: 'Aktive Abos',
      value: String(metrics.active),
      hint: 'Tenants mit laufendem Basis-Plan.',
      icon: CreditCard,
      accent: 'text-[#0d9488] bg-[#f0fdfb]',
    },
    {
      label: 'Ueberfaellig',
      value: String(metrics.pastDue),
      hint: 'Tenants mit fehlgeschlagener Zahlung.',
      icon: AlertTriangle,
      accent: 'text-[#dc2626] bg-[#fef2f2]',
    },
    {
      label: 'In Kuendigung',
      value: String(metrics.canceling),
      hint: 'Abo laeuft zum Periodenende aus.',
      icon: DollarSign,
      accent: 'text-[#b85e34] bg-[#fff8ed]',
    },
    {
      label: 'Manuell gesperrt',
      value: String(metrics.manualLocked),
      hint: 'Vom Owner gesperrte Tenants.',
      icon: Lock,
      accent: 'text-slate-700 bg-slate-100',
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card
          key={item.label}
          className="rounded-[28px] border border-[#e7ddd1] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]"
        >
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Billing
              </p>
              <CardTitle className="mt-2 text-base font-semibold text-slate-900">
                {item.label}
              </CardTitle>
            </div>
            <div className={`rounded-2xl p-3 ${item.accent}`}>
              <item.icon className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tracking-tight text-slate-950">{item.value}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">{item.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export function OwnerBillingWorkspace() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [tenants, setTenants] = useState<TenantBillingRecord[]>([])
  const [metrics, setMetrics] = useState<BillingMetrics>({
    active: 0,
    pastDue: 0,
    canceling: 0,
    manualLocked: 0,
  })
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [subFilter, setSubFilter] = useState<SubscriptionFilter>(
    parseSubscriptionFilter(searchParams.get('subscriptionStatus'))
  )
  const [accessFilter, setAccessFilter] = useState<AccessFilter>(
    parseAccessFilter(searchParams.get('access'))
  )
  const [page, setPage] = useState(parsePage(searchParams.get('page')))

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '')
    setSubFilter(parseSubscriptionFilter(searchParams.get('subscriptionStatus')))
    setAccessFilter(parseAccessFilter(searchParams.get('access')))
    setPage(parsePage(searchParams.get('page')))
  }, [searchParams])

  const rangeLabel = useMemo(() => {
    if (pagination.total === 0) return 'Keine Eintraege'
    const start = (pagination.page - 1) * pagination.pageSize + 1
    const end = Math.min(pagination.page * pagination.pageSize, pagination.total)
    return `${start}-${end} von ${pagination.total}`
  }, [pagination])

  const loadData = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      })
      if (query.trim()) params.set('q', query.trim())
      if (subFilter !== 'all') params.set('subscriptionStatus', subFilter)
      if (accessFilter !== 'all') params.set('access', accessFilter)

      const response = await fetch(`/api/owner/billing?${params.toString()}`, {
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? 'Billing-Daten konnten nicht geladen werden.')
      }

      setMetrics(
        payload.metrics ?? { active: 0, pastDue: 0, canceling: 0, manualLocked: 0 }
      )
      setTenants(payload.tenants ?? [])
      setPagination(
        payload.pagination ?? { page, pageSize: PAGE_SIZE, total: 0, totalPages: 1 }
      )
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Billing-Daten konnten nicht geladen werden.'
      )
    } finally {
      setLoading(false)
    }
  }, [accessFilter, page, query, subFilter])

  useEffect(() => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (subFilter !== 'all') params.set('subscriptionStatus', subFilter)
    if (accessFilter !== 'all') params.set('access', accessFilter)
    if (page > 1) params.set('page', String(page))

    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, {
      scroll: false,
    })

    const timeoutId = window.setTimeout(() => {
      void loadData()
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [accessFilter, page, pathname, query, subFilter, router, loadData])

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[34px] border border-[#ddd3c6] bg-[linear-gradient(135deg,#fffaf2_0%,#f4efe7_52%,#eef7f5_100%)] p-6 shadow-[0_24px_80px_rgba(89,71,42,0.08)] sm:p-8">
        <div className="absolute left-[-2rem] top-[-3rem] h-40 w-40 rounded-full bg-[#1dbfaa]/12 blur-3xl" />
        <div className="absolute bottom-[-3rem] right-[-1rem] h-40 w-40 rounded-full bg-[#eb6f3d]/12 blur-3xl" />

        <div className="relative max-w-3xl space-y-4">
          <Badge className="w-fit rounded-full bg-[#1f2937] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white hover:bg-[#1f2937]">
            Owner Billing
          </Badge>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b85e34]">
              Abrechnung / Super Admin
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Billing-Uebersicht aller Tenants
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              Alle Tenant-Abos auf einen Blick. Erkenne kritische Faelle wie Zahlungsausfaelle oder
              auslaufende Abos sofort und greife bei Bedarf ein.
            </p>
          </div>
        </div>

        <div className="relative mt-8 grid gap-4 lg:grid-cols-3">
          <Card className="rounded-[26px] border border-white/80 bg-white/80 shadow-none backdrop-blur-sm">
            <CardContent className="p-5">
              <CreditCard className="h-5 w-5 text-[#b85e34]" />
              <p className="mt-3 text-sm font-semibold text-slate-900">DB-basierte Uebersicht</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Alle Daten kommen aus der synchronisierten Datenbank, nicht aus Live-Stripe-Calls.
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-[26px] border border-white/80 bg-white/80 shadow-none backdrop-blur-sm">
            <CardContent className="p-5">
              <Shield className="h-5 w-5 text-[#0d9488]" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Manuelle Sperrung</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Tenants koennen unabhaengig vom Stripe-Status gesperrt und freigeschaltet werden.
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-[26px] border border-white/80 bg-white/80 shadow-none backdrop-blur-sm">
            <CardContent className="p-5">
              <AlertTriangle className="h-5 w-5 text-[#1f2937]" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Kritische Faelle</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Tenants mit Zahlungsproblemen oder Kuendigungen werden visuell hervorgehoben.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {error && (
        <Alert className="rounded-[24px] border-[#efc6b6] bg-[#fff0ea] text-[#8c3215]">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-40 rounded-[28px]" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-[30px]" />
        </div>
      ) : (
        <>
          <BillingMetricsRow metrics={metrics} />

          <Card className="rounded-[30px] border border-[#e7ddd1] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
            <CardContent className="space-y-5 p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b85e34]">
                    Tenant Billing
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                    Abo-Status aller Agenturen
                  </h2>
                </div>
                <div className="relative w-full max-w-md">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setPage(1)
                    }}
                    placeholder="Nach Tenant-Name oder Subdomain suchen"
                    className="h-12 rounded-full border-[#ded4c7] bg-[#fcfaf6] pl-11"
                    aria-label="Tenant-Suche"
                  />
                </div>
              </div>

              <Tabs
                value={subFilter}
                onValueChange={(value) => {
                  setSubFilter(value as SubscriptionFilter)
                  setPage(1)
                }}
              >
                <TabsList className="h-auto flex-wrap rounded-full bg-[#f4eee6] p-1">
                  <TabsTrigger value="all" className="rounded-full px-4 py-2">
                    Alle
                  </TabsTrigger>
                  <TabsTrigger value="active" className="rounded-full px-4 py-2">
                    Aktiv
                  </TabsTrigger>
                  <TabsTrigger value="past_due" className="rounded-full px-4 py-2">
                    Ueberfaellig
                  </TabsTrigger>
                  <TabsTrigger value="canceling" className="rounded-full px-4 py-2">
                    In Kuendigung
                  </TabsTrigger>
                  <TabsTrigger value="canceled" className="rounded-full px-4 py-2">
                    Gekuendigt
                  </TabsTrigger>
                  <TabsTrigger value="none" className="rounded-full px-4 py-2">
                    Kein Abo
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Tabs
                value={accessFilter}
                onValueChange={(value) => {
                  setAccessFilter(value as AccessFilter)
                  setPage(1)
                }}
              >
                <TabsList className="h-auto flex-wrap rounded-full bg-[#eef4f2] p-1">
                  <TabsTrigger value="all" className="rounded-full px-4 py-2">
                    Alle Zugaenge
                  </TabsTrigger>
                  <TabsTrigger value="accessible" className="rounded-full px-4 py-2">
                    Aktiv
                  </TabsTrigger>
                  <TabsTrigger value="manual_locked" className="rounded-full px-4 py-2">
                    Manuell gesperrt
                  </TabsTrigger>
                  <TabsTrigger value="billing_blocked" className="rounded-full px-4 py-2">
                    Billing-Block
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex flex-col gap-3 border-t border-[#efe6d9] pt-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <p>Billing-Daten basieren auf dem synchronisierten DB-Stand und sind fuer den Owner zentral lesbar.</p>
                <p>{rangeLabel}</p>
              </div>

              {/* Table */}
              {tenants.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#ddd1c4] bg-[#fcfaf6] px-6 py-12 text-center">
                  <Building2 className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    Keine Tenants gefunden
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Passe deine Filter an oder lege neue Tenants an.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-[#efe6d9]">
                        <TableHead className="text-slate-500">Tenant</TableHead>
                        <TableHead className="text-slate-500">Abo-Status</TableHead>
                        <TableHead className="text-center text-slate-500">Module</TableHead>
                        <TableHead className="text-slate-500">Naechste Abrechnung</TableHead>
                        <TableHead className="text-right text-slate-500">Betrag/Periode</TableHead>
                        <TableHead className="text-slate-500">Zugang</TableHead>
                        <TableHead className="text-right text-slate-500">Aktion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tenants.map((t) => (
                        <TableRow key={t.id} className="border-[#efe6d9]">
                          <TableCell>
                            <div>
                              <p className="font-semibold text-slate-900">{t.name}</p>
                              <p className="text-xs text-slate-500">{t.slug}.boost-hive.de</p>
                            </div>
                          </TableCell>
                          <TableCell>{subscriptionBadge(t.subscriptionStatus)}</TableCell>
                          <TableCell className="text-center">
                            <span className="text-sm font-semibold text-slate-700">
                              {t.moduleCount}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {formatDate(t.nextBillingAt)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold text-slate-900">
                            {t.totalAmount > 0
                              ? formatAmount(t.totalAmount, t.currency)
                              : '--'}
                          </TableCell>
                          <TableCell>{accessBadge(t.accessState)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="rounded-full border-[#ded4c7]"
                            >
                              <Link href={`/owner/tenants/${t.id}?tab=subscription`}>
                                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                Details
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Pagination */}
              <div className="flex flex-col gap-3 border-t border-[#efe6d9] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Seite {pagination.page} von {pagination.totalPages}
                </p>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-[#ded4c7] bg-white"
                    onClick={() => setPage((c) => Math.max(1, c - 1))}
                    disabled={page <= 1}
                  >
                    Zurueck
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-[#ded4c7] bg-white"
                    onClick={() => setPage((c) => Math.min(pagination.totalPages, c + 1))}
                    disabled={page >= pagination.totalPages}
                  >
                    Weiter
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
