import Link from 'next/link'
import {
  ArrowRight,
  FolderKanban,
  Settings2,
  Sparkles,
  Users2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TenantShellContext } from '@/lib/tenant-shell'

interface TenantDashboardOverviewProps {
  context: TenantShellContext
}

export function TenantDashboardOverview({ context }: TenantDashboardOverviewProps) {
  const isAdmin = context.membership.role === 'admin'

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-[28px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)] xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <FolderKanban className="h-5 w-5 text-[#0d9488]" />
              Willkommen in deinem Tenant-Workspace
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-slate-600">
            <p>
              Dein Dashboard dient als gemeinsamer Einstieg fuer Team, Tools und spaetere Module.
              Die Shell ist jetzt bereit, damit `PROJ-10+` ohne neuen Navigationsumbau andocken
              koennen.
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
              <Button
                asChild
                variant="outline"
                className="rounded-full border-[#ded4c7] bg-white text-slate-700 hover:bg-white"
              >
                <Link href="/dashboard">Zur Uebersicht</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border border-[#e6ddd0] bg-[#fffdf9] shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-base text-slate-950">Tenant Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <div className="rounded-2xl bg-[#f7f3ed] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Tenant
              </p>
              <p className="mt-2 font-semibold text-slate-900">{context.tenant.name}</p>
            </div>
            <div className="rounded-2xl bg-[#edf8f6] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Rolle
              </p>
              <p className="mt-2 font-semibold text-slate-900">
                {isAdmin ? 'Admin mit Verwaltungszugriff' : 'Member mit Workspace-Zugriff'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-[28px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base text-slate-950">
              <Users2 className="h-5 w-5 text-[#0d9488]" />
              Verwaltung
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
            <p>
              {isAdmin
                ? 'Dein Team-Bereich ist aktiv und ueber dieselbe Tenant-Shell erreichbar.'
                : 'Verwaltungsbereiche bleiben fuer Admins reserviert und serverseitig geschuetzt.'}
            </p>
            {isAdmin ? (
              <Link
                href="/settings/team"
                className="inline-flex items-center gap-2 font-medium text-[#0d9488] hover:text-[#0b7c72]"
              >
                Team-Einladungen oeffnen
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <Badge className="rounded-full bg-[#fff1e8] text-[#a35a34] hover:bg-[#fff1e8]">
                Nur Admin
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base text-slate-950">
              <Sparkles className="h-5 w-5 text-[#b85e34]" />
              Tools
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
            <p>SEO Analyse, AI Performance und AI Visibility werden in die Shell eingehangen.</p>
            <Badge className="rounded-full bg-[#fff1e8] text-[#a35a34] hover:bg-[#fff1e8]">
              Demnaechst verfuegbar
            </Badge>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base text-slate-950">
              <Settings2 className="h-5 w-5 text-slate-700" />
              Shell Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
            <p>
              Navigation, Header und Rollen-Kontext kommen jetzt aus einer gemeinsamen Tenant-App
              statt aus einzelnen isolierten Seiten.
            </p>
            <Badge className="rounded-full bg-[#edf8f6] text-[#0d9488] hover:bg-[#edf8f6]">
              Tenant Workspace aktiv
            </Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
