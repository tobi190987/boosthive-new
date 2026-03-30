'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  FolderKanban,
  Loader2,
  Lock,
  Settings2,
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

interface TenantDashboardOverviewProps {
  context: TenantShellContext
}

export function TenantDashboardOverview({ context }: TenantDashboardOverviewProps) {
  const isAdmin = context.membership.role === 'admin'
  const [modules, setModules] = useState<DashboardModule[]>([])
  const [modulesLoading, setModulesLoading] = useState(true)

  const loadModules = useCallback(async () => {
    try {
      setModulesLoading(true)
      const response = await fetch('/api/tenant/billing', { credentials: 'include' })
      const payload = await response.json().catch(() => ({}))
      if (response.ok && payload.modules) {
        setModules(payload.modules)
      }
    } catch {
      // Non-fatal: modules just stay empty
    } finally {
      setModulesLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadModules()
  }, [loadModules])

  const activeModules = modules.filter((m) => m.status === 'active' || m.status === 'canceling')
  const gatedModules = modules.filter(
    (m) => m.status === 'not_subscribed' || m.status === 'canceled'
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950 dark:text-slate-50">
              <FolderKanban className="h-5 w-5 text-blue-600" />
              Willkommen in deinem Tenant-Workspace
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
            <p>
              Dein Dashboard dient als gemeinsamer Einstieg für Team, Tools und gebuchte Module.
              {activeModules.length > 0
                ? ` Du hast aktuell ${activeModules.length} aktive${activeModules.length === 1 ? 's' : ''} Modul${activeModules.length === 1 ? '' : 'e'}.`
                : ' Buche Module, um zusaetzliche Tools freizuschalten.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
              >
                <Link href={isAdmin ? '/settings/team' : '/dashboard'}>
                  {isAdmin ? 'Team verwalten' : 'Workspace erkunden'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              {isAdmin && (
                <Button
                  asChild
                  variant="outline"
                  className="rounded-full border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#1e2635]"
                >
                  <Link href="/billing">Module verwalten</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] shadow-soft">
          <CardHeader>
            <CardTitle className="text-base text-slate-950 dark:text-slate-50">Tenant Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <div className="rounded-2xl bg-slate-50 dark:bg-[#151c28] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                Tenant
              </p>
              <p className="mt-2 font-semibold text-slate-900 dark:text-slate-100">{context.tenant.name}</p>
            </div>
            <div className="rounded-2xl bg-blue-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                Rolle
              </p>
              <p className="mt-2 font-semibold text-slate-900 dark:text-slate-100">
                {isAdmin ? 'Admin mit Verwaltungszugriff' : 'Member mit Workspace-Zugriff'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ----- Module Cards ----- */}
      {modulesLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-[2rem]" />
          ))}
        </div>
      ) : modules.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base text-slate-950 dark:text-slate-50">
                <Sparkles className="h-5 w-5 text-blue-600" />
                Tools
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <p>Module wie SEO Analyse, AI Performance und AI Visibility können über den Billing-Bereich gebucht werden.</p>
              {isAdmin ? (
                <Link
                  href="/billing"
                  className="inline-flex items-center gap-2 font-medium text-blue-600 hover:text-blue-700"
                >
                  Module ansehen
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <Badge className="rounded-full bg-slate-100 dark:bg-[#1e2635] text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252d3a]">
                  Noch keine Module gebucht
                </Badge>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base text-slate-950 dark:text-slate-50">
                <Users2 className="h-5 w-5 text-blue-600" />
                Verwaltung
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <p>
                {isAdmin
                  ? 'Dein Team-Bereich ist aktiv und über dieselbe Tenant-Shell erreichbar.'
                  : 'Verwaltungsbereiche bleiben für Admins reserviert und serverseitig geschützt.'}
              </p>
              {isAdmin ? (
                <Link
                  href="/settings/team"
                  className="inline-flex items-center gap-2 font-medium text-blue-600 hover:text-blue-700"
                >
                  Team-Einladungen öffnen
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <Badge className="rounded-full bg-slate-100 dark:bg-[#1e2635] text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252d3a]">
                  Nur Admin
                </Badge>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base text-slate-950 dark:text-slate-50">
                <Settings2 className="h-5 w-5 text-slate-700 dark:text-slate-300" />
                Shell Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <p>
                Navigation, Header und Rollen-Kontext kommen aus einer gemeinsamen Tenant-App.
              </p>
              <Badge className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50">
                Tenant Workspace aktiv
              </Badge>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          {/* Active modules */}
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

          {/* Gated modules */}
          {gatedModules.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                Verfuegbare Module
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
                          className="inline-flex items-center gap-2 font-medium text-blue-600 hover:text-blue-600"
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

          {/* Management cards */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base text-slate-950 dark:text-slate-50">
                  <Users2 className="h-5 w-5 text-blue-600" />
                  Verwaltung
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                <p>
                  {isAdmin
                    ? 'Dein Team-Bereich ist aktiv und über dieselbe Tenant-Shell erreichbar.'
                    : 'Verwaltungsbereiche bleiben für Admins reserviert und serverseitig geschützt.'}
                </p>
                {isAdmin ? (
                  <Link
                    href="/settings/team"
                    className="inline-flex items-center gap-2 font-medium text-blue-600 hover:text-blue-700"
                  >
                    Team-Einladungen öffnen
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <Badge className="rounded-full bg-slate-100 dark:bg-[#1e2635] text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252d3a]">
                    Nur Admin
                  </Badge>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base text-slate-950 dark:text-slate-50">
                  <Settings2 className="h-5 w-5 text-slate-700 dark:text-slate-300" />
                  Shell Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                <p>
                  Navigation, Header und Rollen-Kontext kommen aus einer gemeinsamen Tenant-App.
                </p>
                <Badge className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50">
                  Tenant Workspace aktiv
                </Badge>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
