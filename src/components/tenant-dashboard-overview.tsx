'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CheckSquare,
  Clock,
  FileText,
  Loader2,
  Lock,
  Megaphone,
  Sparkles,
  Users2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { TenantShellContext } from '@/lib/tenant-shell'

interface DashboardModule {
  id: string
  code: string
  name: string
  description: string
  status: 'active' | 'canceling' | 'canceled' | 'not_subscribed'
  current_period_end: string | null
}

interface ActivityItem {
  id: string
  type: 'approval_event' | 'content_brief' | 'ad_generation'
  label: string
  subtitle: string | null
  link: string
  created_at: string
}

interface TenantDashboardOverviewProps {
  context: TenantShellContext
}

function getGreeting(firstName: string | null): string {
  const hour = new Date().getHours()
  const name = firstName ? `, ${firstName}` : ''
  if (hour < 12) return `Guten Morgen${name}`
  if (hour < 18) return `Guten Tag${name}`
  return `Guten Abend${name}`
}

function formatActivityTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return 'Gerade eben'
  if (minutes < 60) return `Vor ${minutes} Min.`

  const isToday = date.toDateString() === now.toDateString()
  const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Heute, ${timeStr}`

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Gestern, ${timeStr}`

  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function activityIcon(type: ActivityItem['type']) {
  switch (type) {
    case 'approval_event':
      return <CheckSquare className="h-4 w-4 text-blue-500 dark:text-blue-400" />
    case 'content_brief':
      return <FileText className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
    case 'ad_generation':
      return <Megaphone className="h-4 w-4 text-purple-500 dark:text-purple-400" />
  }
}

function activityIconBg(type: ActivityItem['type']) {
  switch (type) {
    case 'approval_event':
      return 'bg-blue-50 dark:bg-blue-950/40'
    case 'content_brief':
      return 'bg-emerald-50 dark:bg-emerald-950/40'
    case 'ad_generation':
      return 'bg-purple-50 dark:bg-purple-950/40'
  }
}

interface StatCardProps {
  label: string
  value: number | null
  icon: React.ReactNode
  href: string
  loading: boolean
}

function StatCard({ label, value, icon, href, loading }: StatCardProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 transition-all hover:border-slate-200 hover:shadow-md dark:border-[#252d3a] dark:bg-[#151c28] dark:hover:border-[#2d3847]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800/50">
        {icon}
      </div>
      <div>
        {loading ? (
          <Skeleton className="h-7 w-10" />
        ) : (
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">{value ?? '—'}</p>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </Link>
  )
}

export function TenantDashboardOverview({ context }: TenantDashboardOverviewProps) {
  const router = useRouter()
  const isAdmin = context.membership.role === 'admin'
  const firstName = context.user.firstName ?? null

  const [modules, setModules] = useState<DashboardModule[]>([])
  const [modulesLoading, setModulesLoading] = useState(true)

  const [stats, setStats] = useState<{ pendingApprovals: number; briefs: number; customers: number; ads: number } | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(true)

  const loadModules = useCallback(async () => {
    try {
      setModulesLoading(true)
      const response = await fetch('/api/tenant/billing', { credentials: 'include' })
      const payload = await response.json().catch(() => ({}))
      if (response.ok && payload.modules) setModules(payload.modules)
    } catch {
      // non-fatal
    } finally {
      setModulesLoading(false)
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      setStatsLoading(true)
      const [approvalsRes, briefsRes, customersRes, adsRes] = await Promise.allSettled([
        fetch('/api/tenant/approvals'),
        fetch('/api/tenant/content/briefs'),
        fetch('/api/tenant/customers'),
        fetch('/api/tenant/ad-generator/history'),
      ])

      const approvals = approvalsRes.status === 'fulfilled' && approvalsRes.value.ok
        ? await approvalsRes.value.json().catch(() => ({})) : {}
      const briefs = briefsRes.status === 'fulfilled' && briefsRes.value.ok
        ? await briefsRes.value.json().catch(() => ({})) : {}
      const customers = customersRes.status === 'fulfilled' && customersRes.value.ok
        ? await customersRes.value.json().catch(() => ({})) : {}
      const ads = adsRes.status === 'fulfilled' && adsRes.value.ok
        ? await adsRes.value.json().catch(() => ({})) : {}

      setStats({
        pendingApprovals: ((approvals.approvals ?? []) as Array<{ status?: string }>).filter(
          (approval) =>
            approval.status === 'pending_approval' || approval.status === 'changes_requested'
        ).length,
        briefs: (briefs.briefs ?? []).length,
        customers: (customers.customers ?? []).length,
        ads: (ads.generations ?? ads.ads ?? []).length,
      })
    } catch {
      // non-fatal
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const loadActivities = useCallback(async () => {
    try {
      setActivitiesLoading(true)
      const res = await fetch('/api/tenant/activity')
      if (res.ok) {
        const data = await res.json()
        setActivities(data.activities ?? [])
      }
    } catch {
      // non-fatal
    } finally {
      setActivitiesLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadModules()
    void loadStats()
    void loadActivities()
  }, [loadModules, loadStats, loadActivities])

  const activeModules = modules.filter((m) => m.status === 'active' || m.status === 'canceling')
  const gatedModules = modules.filter((m) => m.status === 'not_subscribed' || m.status === 'canceled')

  return (
    <div className="space-y-8">
      {/* Greeting Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{getGreeting(firstName)}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Dein Workspace-Überblick für heute</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Offene Freigaben"
          value={stats?.pendingApprovals ?? null}
          icon={<Clock className="h-5 w-5 text-amber-500" />}
          href="/tools/approvals"
          loading={statsLoading}
        />
        <StatCard
          label="Content Briefs"
          value={stats?.briefs ?? null}
          icon={<FileText className="h-5 w-5 text-emerald-500" />}
          href="/tools/content-briefs"
          loading={statsLoading}
        />
        <StatCard
          label="Kunden"
          value={stats?.customers ?? null}
          icon={<Users2 className="h-5 w-5 text-blue-500" />}
          href="/tools/customers"
          loading={statsLoading}
        />
        <StatCard
          label="Ad-Texte"
          value={stats?.ads ?? null}
          icon={<Megaphone className="h-5 w-5 text-purple-500" />}
          href="/tools/ad-generator"
          loading={statsLoading}
        />
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Activity Feed */}
        <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft xl:col-span-2">
          <CardHeader className="border-b border-slate-100 dark:border-[#252d3a] px-6 py-4">
            <CardTitle className="text-base text-slate-900 dark:text-slate-50">Letzte Aktivitäten</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activitiesLoading ? (
              <div className="space-y-3 p-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800">
                  <Sparkles className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                </div>
                <p className="text-sm text-slate-400 dark:text-slate-500">Noch keine Aktivitäten vorhanden.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-[#252d3a]">
                {activities.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-[#1e2635]/40"
                      onClick={() => router.push(item.link)}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${activityIconBg(item.type)}`}>
                        {activityIcon(item.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{item.label}</p>
                        {item.subtitle && (
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.subtitle}</p>
                        )}
                      </div>
                      <p className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                        {formatActivityTime(item.created_at)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions + Role Info */}
        <div className="space-y-4">
          <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-900 dark:text-slate-50">Schnellzugriff</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" className="w-full justify-between rounded-xl">
                <Link href="/tools/content-briefs">
                  Content Brief erstellen
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between rounded-xl">
                <Link href="/tools/ad-generator">
                  Ad-Text generieren
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between rounded-xl">
                <Link href="/tools/approvals">
                  Freigaben verwalten
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              {isAdmin && (
                <Button asChild variant="outline" className="w-full justify-between rounded-xl">
                  <Link href="/settings/team">
                    Team verwalten
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#0e1420] shadow-none">
            <CardContent className="p-4 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">Workspace</p>
              <p className="font-semibold text-slate-900 dark:text-slate-100">{context.tenant.name}</p>
              <Badge className="mt-1 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400 dark:hover:bg-blue-950/50">
                {isAdmin ? 'Admin' : 'Member'}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Module Cards */}
      {!modulesLoading && modules.length > 0 && (
        <div className="space-y-4">
          {activeModules.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                Aktive Module
              </p>
              <div className="grid gap-4 lg:grid-cols-3">
                {activeModules.map((mod) => (
                  <Card
                    key={mod.id}
                    className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft"
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-base text-slate-950 dark:text-slate-50">
                        <span className="flex items-center gap-3">
                          <Sparkles className="h-5 w-5 text-blue-600" />
                          {mod.name}
                        </span>
                        {mod.status === 'canceling' && (
                          <Badge className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50">
                            Endet bald
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      <p>{mod.description}</p>
                      <Badge className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50">
                        Freigeschaltet
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {gatedModules.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                Verfügbare Module
              </p>
              <div className="grid gap-4 lg:grid-cols-3">
                {gatedModules.map((mod) => (
                  <Card
                    key={mod.id}
                    className="rounded-[2rem] border border-dashed border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] shadow-none"
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3 text-base text-slate-500 dark:text-slate-400">
                        <Lock className="h-5 w-5 text-slate-300" />
                        {mod.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      <p>{mod.description}</p>
                      {isAdmin ? (
                        <Link
                          href="/billing"
                          className="inline-flex items-center gap-2 font-medium text-blue-600 hover:text-blue-700"
                        >
                          Modul buchen
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      ) : (
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          Wende dich an deinen Admin, um dieses Modul freizuschalten.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
