'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getUserDisplayName, getUserInitials } from '@/lib/profile'
import { ThemeToggle } from '@/components/theme-toggle'
import type { OwnerShellContext } from '@/lib/owner-shell'
import { cn } from '@/lib/utils'

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed'

const navItems = [
  {
    section: 'Platform',
    items: [
      { label: 'Dashboard', href: '/owner/dashboard', icon: LayoutDashboard },
      { label: 'Agenturen', href: '/owner/tenants', icon: Building2 },
      { label: 'Abrechnung', href: '/owner/billing', icon: CreditCard },
    ],
  },
]

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/owner/login'
}

function NavContent({
  context,
  onNavigate,
  collapsed = false,
}: {
  context: OwnerShellContext
  onNavigate?: () => void
  collapsed?: boolean
}) {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/owner/dashboard') {
      return pathname === '/owner' || pathname === '/owner/dashboard'
    }
    return pathname.startsWith(href)
  }

  return (
    <>
      <div className={cn('flex items-center gap-3 py-4', collapsed ? 'px-3 justify-center' : 'px-4')}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50">
          <Image
            src="/favicon_dark.png"
            alt="BoostHive"
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">BoostHive Owner</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">root.boost-hive.de</p>
          </div>
        )}
      </div>

      <Separator className="bg-slate-100 dark:bg-[#252d3a]" />

      <nav className={cn('flex-1 py-3', collapsed ? 'px-2' : 'px-3')} aria-label="Owner Navigation">
        {navItems.map((section) => (
          <div key={section.section} className="space-y-2">
            {!collapsed && (
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-400">
                {section.section}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.href)
                const link = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center rounded-2xl text-sm font-medium transition-colors',
                      collapsed
                        ? 'h-10 w-10 justify-center mx-auto'
                        : 'justify-between px-3 py-2.5',
                      active
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1e2635]/70 dark:hover:text-slate-100'
                    )}
                    aria-current={active ? 'page' : undefined}
                    aria-label={collapsed ? item.label : undefined}
                  >
                    {collapsed ? (
                      <item.icon
                        className={cn(
                          'h-5 w-5 shrink-0',
                          active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-400'
                        )}
                      />
                    ) : (
                      <>
                        <span className="flex items-center gap-3">
                          <item.icon
                            className={cn(
                              'h-4 w-4 shrink-0',
                              active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-400'
                            )}
                          />
                          {item.label}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-500" />
                      </>
                    )}
                  </Link>
                )

                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <Separator className="bg-slate-100 dark:bg-[#252d3a]" />

      <div className={cn('space-y-2', collapsed ? 'p-2' : 'p-4')}>
        {collapsed ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/owner/profile"
                  onClick={onNavigate}
                  className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl transition hover:bg-slate-50 dark:hover:bg-[#1e2635]"
                  aria-label="Profil öffnen"
                >
                  <Avatar className="h-8 w-8 border border-slate-100 dark:border-[#2d3847]">
                    <AvatarImage src={context.user.avatarUrl ?? undefined} alt={context.user.email} />
                    <AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                      {getUserInitials(
                        { first_name: context.user.firstName, last_name: context.user.lastName },
                        context.user.email
                      )}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Profil</TooltipContent>
            </Tooltip>
            <div className="flex justify-center">
              <ThemeToggle />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleLogout}
                  aria-label="Abmelden"
                  className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-[#1e2635]/70 dark:hover:text-slate-200"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Abmelden</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <>
            <Link
              href="/owner/profile"
              onClick={onNavigate}
              className="block rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:border-slate-200 hover:bg-slate-50 dark:border-border dark:bg-card dark:hover:border-[#2d3847] dark:hover:bg-[#1e2635]"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border border-slate-100 dark:border-[#2d3847]">
                  <AvatarImage src={context.user.avatarUrl ?? undefined} alt={context.user.email} />
                  <AvatarFallback className="bg-blue-50 text-sm font-semibold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                    {getUserInitials(
                      { first_name: context.user.firstName, last_name: context.user.lastName },
                      context.user.email
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {getUserDisplayName(
                      { first_name: context.user.firstName, last_name: context.user.lastName },
                      context.user.email
                    )}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Owner</p>
                </div>
                <ThemeToggle className="ml-auto shrink-0" />
              </div>
            </Link>

            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-[#1e2635]/70 dark:hover:text-slate-200"
            >
              <LogOut className="h-4 w-4 text-slate-400 dark:text-slate-400" />
              Abmelden
            </button>
          </>
        )}
      </div>
    </>
  )
}

function subscribeToSidebarStorage(cb: () => void) {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}

function getCollapsedSnapshot(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

function getServerCollapsedSnapshot(): boolean {
  return false
}

export function OwnerSidebar({ context }: { context: OwnerShellContext }) {
  const storedCollapsed = useSyncExternalStore(
    subscribeToSidebarStorage,
    getCollapsedSnapshot,
    getServerCollapsedSnapshot
  )
  const [override, setOverride] = useState<boolean | null>(null)
  const isCollapsed = override ?? storedCollapsed

  const toggleCollapsed = useCallback(() => {
    const next = !isCollapsed
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
    } catch {
      /* ignore */
    }
    setOverride(next)
  }, [isCollapsed])

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r border-slate-100 bg-white transition-[width] duration-200 dark:border-border dark:bg-[#080c12] md:flex',
        isCollapsed ? 'w-[64px] lg:w-[280px]' : 'w-[280px]'
      )}
    >
      <div className="relative flex h-full flex-col">
        {/* Collapse-Toggle: nur auf md..lg sichtbar */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          aria-pressed={isCollapsed}
          className="absolute right-[-12px] top-6 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:text-slate-900 dark:border-border dark:bg-card dark:text-slate-400 dark:hover:text-slate-100 md:flex lg:hidden"
        >
          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
        {/* Auf lg+ immer ausgeklappt rendern */}
        <div className="flex h-full flex-col lg:hidden">
          <NavContent context={context} collapsed={isCollapsed} />
        </div>
        <div className="hidden h-full flex-col lg:flex">
          <NavContent context={context} collapsed={false} />
        </div>
      </div>
    </aside>
  )
}

export function OwnerMobileHeader({ context }: { context: OwnerShellContext }) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-100 bg-white/95 px-4 backdrop-blur dark:border-border dark:bg-[#080c12]/95 md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Owner Navigation öffnen"
        className="text-slate-700 dark:text-slate-300"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">BoostHive Owner</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{context.user.email}</p>
      </div>

      <div className="ml-auto">
        <Badge className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400 dark:hover:bg-blue-950/50">
          Plattform
        </Badge>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[300px] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Owner Navigation</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col bg-white dark:bg-[#080c12]">
            <NavContent context={context} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
