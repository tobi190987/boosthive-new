'use client'

import { useState, type ComponentType } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  Sparkles,
  Users2,
} from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { TenantLogoutButton } from '@/components/tenant-logout-button'
import { cn } from '@/lib/utils'
import type { TenantShellContext } from '@/lib/tenant-shell'

interface TenantShellNavigationProps {
  context: TenantShellContext
}

interface NavItem {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
  comingSoon?: boolean
}

function initialsFromEmail(email: string) {
  return email.slice(0, 2).toUpperCase()
}

function roleLabel(role: TenantShellContext['membership']['role']) {
  return role === 'admin' ? 'Admin' : 'Member'
}

function tenantNav(context: TenantShellContext) {
  const workspace: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Tools', href: '/tools', icon: Sparkles, comingSoon: true },
  ]

  const administration: NavItem[] =
    context.membership.role === 'admin'
      ? [
          { label: 'User-Management', href: '/settings/team', icon: Users2 },
          { label: 'Einstellungen', href: '/settings', icon: Settings2, comingSoon: true },
        ]
      : []

  return { workspace, administration }
}

function isNavActive(pathname: string, href: string) {
  if (href === '/dashboard') {
    return pathname === '/dashboard'
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavigationContent({
  context,
  onNavigate,
}: TenantShellNavigationProps & { onNavigate?: () => void }) {
  const pathname = usePathname()
  const sections = tenantNav(context)

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/favicon_dark.png"
          alt=""
          width={34}
          height={34}
          className="h-8 w-8 object-contain"
          style={{ mixBlendMode: 'multiply' }}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{context.tenant.name}</p>
          <p className="truncate text-xs text-slate-500">{context.tenant.slug}.boost-hive.de</p>
        </div>
      </div>

      <Separator className="bg-[#ebe2d5]" />

      <nav className="flex-1 px-3 py-3" aria-label="Tenant Navigation">
        <div className="space-y-6">
          <div>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Workspace
            </p>
            <ul className="space-y-1">
              {sections.workspace.map((item) => {
                const active = isNavActive(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.comingSoon ? '/dashboard' : item.href}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors',
                        active
                          ? 'bg-[#edf8f6] text-[#0d9488]'
                          : 'text-slate-600 hover:bg-[#f7f3ed] hover:text-slate-900'
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className="flex items-center gap-3">
                        <item.icon
                          className={cn(
                            'h-4 w-4',
                            active ? 'text-[#0d9488]' : 'text-slate-400'
                          )}
                        />
                        {item.label}
                      </span>
                      {item.comingSoon ? (
                        <Badge className="rounded-full bg-[#fff1e8] text-[#a35a34] hover:bg-[#fff1e8]">
                          Demnaechst
                        </Badge>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>

          {sections.administration.length > 0 && (
            <div>
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                Verwaltung
              </p>
              <ul className="space-y-1">
                {sections.administration.map((item) => {
                  const active = isNavActive(pathname, item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.comingSoon ? '/settings/team' : item.href}
                        onClick={onNavigate}
                        className={cn(
                          'flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors',
                          active
                            ? 'bg-[#edf8f6] text-[#0d9488]'
                            : 'text-slate-600 hover:bg-[#f7f3ed] hover:text-slate-900'
                        )}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span className="flex items-center gap-3">
                          <item.icon
                            className={cn(
                              'h-4 w-4',
                              active ? 'text-[#0d9488]' : 'text-slate-400'
                            )}
                          />
                          {item.label}
                        </span>
                        {item.comingSoon ? (
                          <Badge className="rounded-full bg-[#fff1e8] text-[#a35a34] hover:bg-[#fff1e8]">
                            Demnaechst
                          </Badge>
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-300" />
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </nav>

      <Separator className="bg-[#ebe2d5]" />

      <div className="space-y-4 p-4">
        <div className="rounded-[26px] border border-[#ebe2d5] bg-white p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f8f3] text-sm font-semibold text-[#0d9488]">
              {initialsFromEmail(context.user.email)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{context.user.email}</p>
              <p className="text-xs text-slate-500">{roleLabel(context.membership.role)}</p>
            </div>
          </div>
        </div>

        <TenantLogoutButton
          className="w-full rounded-2xl border-[#e3daca] bg-white justify-center"
          label="Abmelden"
          icon={<LogOut className="h-4 w-4" />}
        />
      </div>
    </>
  )
}

export function TenantSidebar(props: TenantShellNavigationProps) {
  return (
    <aside className="hidden h-screen w-[280px] shrink-0 flex-col border-r border-[#ebe2d5] bg-[#fffaf3] md:flex">
      <NavigationContent {...props} />
    </aside>
  )
}

export function TenantMobileHeader(props: TenantShellNavigationProps) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[#ebe2d5] bg-[#fffaf3]/95 px-4 backdrop-blur md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-slate-700"
        onClick={() => setOpen(true)}
        aria-label="Tenant Navigation oeffnen"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{props.context.tenant.name}</p>
        <p className="truncate text-xs text-slate-500">{roleLabel(props.context.membership.role)}</p>
      </div>

      <div className="ml-auto">
        <Badge className="rounded-full bg-[#edf8f6] text-[#0d9488] hover:bg-[#edf8f6]">
          Workspace
        </Badge>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[300px] p-0">
          <div className="flex h-full flex-col bg-[#fffaf3]">
            <NavigationContent {...props} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
