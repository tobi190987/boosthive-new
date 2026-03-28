'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Building2, Plus, Search, Sparkles } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OwnerDashboardMetrics } from '@/components/owner-dashboard-metrics'
import {
  OwnerTenantTable,
  type OwnerTenantRecord,
} from '@/components/owner-tenant-table'
import {
  canOwnerToggleTenantStatus,
  nextOwnerToggleTenantStatus,
} from '@/lib/tenant-status'

type StatusFilter = 'all' | 'active' | 'inactive'

interface DashboardMetrics {
  totalTenants: number
  activeTenants: number
  inactiveTenants: number
  totalUsers: number
}

interface PaginationState {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const PAGE_SIZE = 20

function parseStatusFilter(value: string | null): StatusFilter {
  if (value === 'active' || value === 'inactive') {
    return value
  }

  return 'all'
}

function parsePage(value: string | null) {
  const parsed = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export function OwnerDashboardWorkspace() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [tenants, setTenants] = useState<OwnerTenantRecord[]>([])
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalTenants: 0,
    activeTenants: 0,
    inactiveTenants: 0,
    totalUsers: 0,
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    parseStatusFilter(searchParams.get('status'))
  )
  const [page, setPage] = useState(parsePage(searchParams.get('page')))
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '')
    setStatusFilter(parseStatusFilter(searchParams.get('status')))
    setPage(parsePage(searchParams.get('page')))
  }, [searchParams])

  const rangeLabel = useMemo(() => {
    if (pagination.total === 0) {
      return 'Keine Eintraege'
    }

    const start = (pagination.page - 1) * pagination.pageSize + 1
    const end = Math.min(pagination.page * pagination.pageSize, pagination.total)
    return `${start}-${end} von ${pagination.total}`
  }, [pagination])

  const refreshTenantData = useCallback(async () => {
    const refreshParams = new URLSearchParams({
      status: statusFilter,
      page: String(page),
      pageSize: String(PAGE_SIZE),
      ...(query.trim() ? { q: query.trim() } : {}),
    })

    const [metricsResponse, tenantsResponse] = await Promise.all([
      fetch('/api/owner/dashboard', { credentials: 'include' }),
      fetch(`/api/owner/tenants?${refreshParams.toString()}`, {
        credentials: 'include',
      }),
    ])

    const metricsPayload = await metricsResponse.json().catch(() => ({}))
    const tenantsPayload = await tenantsResponse.json().catch(() => ({}))

    if (!metricsResponse.ok) {
      throw new Error(
        metricsPayload.error ?? 'Owner-Dashboard-Metriken konnten nicht geladen werden.'
      )
    }

    if (!tenantsResponse.ok) {
      throw new Error(tenantsPayload.error ?? 'Owner-Dashboard konnte nicht geladen werden.')
    }

    setMetrics(
      metricsPayload.metrics ?? {
        totalTenants: 0,
        activeTenants: 0,
        inactiveTenants: 0,
        totalUsers: 0,
      }
    )
    setTenants(tenantsPayload.tenants ?? [])
    setPagination(
      tenantsPayload.pagination ?? {
        page,
        pageSize: PAGE_SIZE,
        total: 0,
        totalPages: 1,
      }
    )
  }, [page, query, statusFilter])

  useEffect(() => {
    let isActive = true
    const trimmedQuery = query.trim()
    const params = new URLSearchParams()

    if (trimmedQuery) params.set('q', trimmedQuery)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (page > 1) params.set('page', String(page))

    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, {
      scroll: false,
    })

    async function loadDashboard() {
      try {
        setError(null)
        setLoading(true)
        await refreshTenantData()
      } catch (loadError) {
        if (!isActive) return

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Owner-Dashboard konnte nicht geladen werden.'
        )
      } finally {
        if (isActive) {
          setLoading(false)
        }
      }
    }

    const timeoutId = window.setTimeout(() => {
      void loadDashboard()
    }, 250)

    return () => {
      isActive = false
      window.clearTimeout(timeoutId)
    }
  }, [page, pathname, query, refreshTenantData, router, statusFilter])

  async function handleToggleStatus(tenant: OwnerTenantRecord) {
    const nextStatus = nextOwnerToggleTenantStatus(tenant.status)
    if (!nextStatus || !canOwnerToggleTenantStatus(tenant.status)) {
      setError('Dieser Tenant-Status kann derzeit nicht direkt aus der Listenansicht umgeschaltet werden.')
      return
    }

    setTogglingId(tenant.id)
    setError(null)

    try {
      const response = await fetch(`/api/owner/tenants/${tenant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? 'Tenant-Status konnte nicht aktualisiert werden.')
      }

      await refreshTenantData()
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Tenant-Status konnte nicht aktualisiert werden.'
      )
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDeleteTenant(tenant: OwnerTenantRecord) {
    setDeletingId(tenant.id)
    setError(null)

    try {
      const response = await fetch(`/api/owner/tenants/${tenant.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? 'Tenant konnte nicht gelöscht werden.')
      }

      await refreshTenantData()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Tenant konnte nicht gelöscht werden.'
      )
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[34px] border border-[#ddd3c6] bg-[linear-gradient(135deg,#fffaf2_0%,#f4efe7_52%,#eef7f5_100%)] p-6 shadow-[0_24px_80px_rgba(89,71,42,0.08)] sm:p-8">
        <div className="absolute left-[-2rem] top-[-3rem] h-40 w-40 rounded-full bg-[#1dbfaa]/12 blur-3xl" />
        <div className="absolute bottom-[-3rem] right-[-1rem] h-40 w-40 rounded-full bg-[#eb6f3d]/12 blur-3xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <Badge className="w-fit rounded-full bg-[#1f2937] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white hover:bg-[#1f2937]">
              Owner Control
            </Badge>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b85e34]">
                Root Domain / Super Admin
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Systemweite Tenant-Übersicht für BoostHive
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                Filtere aktive und inaktive Agenturen, springe in den Provisioning-Flow und behalte
                den globalen Plattformzustand in einer klaren Owner-Oberflaeche im Blick.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              className="rounded-full bg-[#1f2937] px-5 text-white hover:bg-[#111827]"
            >
              <Link href="/owner/tenants/new">
                <Plus className="h-4 w-4" />
                Neuer Tenant
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-[#ded4c7] bg-white/80 text-slate-700 hover:bg-white"
            >
              <Link href="/owner/tenants">Tenant-Liste</Link>
            </Button>
          </div>
        </div>

        <div className="relative mt-8 grid gap-4 lg:grid-cols-3">
          <Card className="rounded-[26px] border border-white/80 bg-white/80 shadow-none backdrop-blur-sm">
            <CardContent className="p-5">
              <Sparkles className="h-5 w-5 text-[#b85e34]" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Metriken auf einen Blick</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Total, aktive und derzeit blockierte Agenturen bleiben schnell scanbar.
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-[26px] border border-white/80 bg-white/80 shadow-none backdrop-blur-sm">
            <CardContent className="p-5">
              <Search className="h-5 w-5 text-[#0d9488]" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Suche und Filter</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Name und Subdomain werden jetzt über die Owner-API serverseitig gefiltert.
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-[26px] border border-white/80 bg-white/80 shadow-none backdrop-blur-sm">
            <CardContent className="p-5">
              <Building2 className="h-5 w-5 text-[#1f2937]" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Statuswechsel mit Klarheit</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Manuelle Statuswechsel bleiben bestaetigt, richer Sperrgruende werden sauber angezeigt.
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
          <Skeleton className="h-32 rounded-[30px]" />
          <Skeleton className="h-80 rounded-[30px]" />
        </div>
      ) : (
        <>
          <OwnerDashboardMetrics {...metrics} />

          <Card className="rounded-[30px] border border-[#e7ddd1] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
            <CardContent className="space-y-5 p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b85e34]">
                    Tenant Explorer
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                    Alle Agenturen im Owner-Blick
                  </h2>
                </div>
                <div className="relative w-full max-w-md">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setPage(1)
                    }}
                    placeholder="Nach Tenant-Name oder Subdomain suchen"
                    className="h-12 rounded-full border-[#ded4c7] bg-[#fcfaf6] pl-11"
                  />
                </div>
              </div>

              <Tabs
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as StatusFilter)
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
                  <TabsTrigger value="inactive" className="rounded-full px-4 py-2">
                    Pausiert
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex flex-col gap-3 border-t border-[#efe6d9] pt-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <p>Suche, Filter und Member-Counts werden serverseitig konsistent fuer alle Agenturen geladen.</p>
                <p>{rangeLabel}</p>
              </div>

              <OwnerTenantTable
                tenants={tenants}
                busyTenantId={togglingId ?? deletingId}
                archivedFilter="exclude"
                onToggleStatus={handleToggleStatus}
                onArchiveTenant={handleDeleteTenant}
                onRestoreTenant={async () => undefined}
                onHardDeleteTenant={handleDeleteTenant}
              />

              <div className="flex flex-col gap-3 border-t border-[#efe6d9] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Seite {pagination.page} von {pagination.totalPages}
                </p>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-[#ded4c7] bg-white"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                  >
                    Zurück
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-[#ded4c7] bg-white"
                    onClick={() =>
                      setPage((current) => Math.min(pagination.totalPages, current + 1))
                    }
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
