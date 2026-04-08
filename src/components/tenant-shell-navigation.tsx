'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  Bot,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Eye,
  FileImage,
  FileText,
  LayoutGrid,
  LayoutDashboard,
  Loader2,
  Lock,
  Megaphone,
  Menu,
  Search,
  ShieldCheck,
  UserRound,
  Users2,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getUserDisplayName, getUserInitials } from '@/lib/profile'
import { ThemeToggle } from '@/components/theme-toggle'
import { CustomerSelectorDropdown } from '@/components/customer-selector-dropdown'
import { NotificationBell } from '@/components/notification-bell'
import { cn } from '@/lib/utils'
import { GlobalCommandPalette } from '@/components/global-command-palette'
import { useActiveCustomer } from '@/lib/active-customer-context'
import { writeSessionCache } from '@/lib/client-cache'
import type { ShellNotification } from '@/lib/tenant-app-data'
import type { TenantShellContext } from '@/lib/tenant-shell'

interface TenantShellNavigationProps {
  context: TenantShellContext
  initialOpenApprovalsCount?: number
  initialNotifications?: ShellNotification[]
}

interface NavItem {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
  comingSoon?: boolean
}

interface ToolNavItem {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
  moduleCode: string
}

const TOOL_GROUPS: { label: string; items: ToolNavItem[] }[] = [
  {
    label: 'Analyse & SEO',
    items: [
      { label: 'SEO Analyse', href: '/tools/seo-analyse', icon: BarChart3, moduleCode: 'seo_analyse' },
      { label: 'Keywordranking', href: '/tools/keywords', icon: Search, moduleCode: 'seo_analyse' },
      { label: 'AI Performance', href: '/tools/ai-performance', icon: Bot, moduleCode: 'ai_performance' },
      { label: 'AI Visibility', href: '/tools/ai-visibility', icon: Eye, moduleCode: 'ai_visibility' },
    ],
  },
  {
    label: 'Content & Kampagnen',
    items: [
      { label: 'Content Briefs', href: '/tools/content-briefs', icon: FileText, moduleCode: 'content_briefs' },
      { label: 'Ad Generator', href: '/tools/ad-generator', icon: Megaphone, moduleCode: 'ad_generator' },
      { label: 'Ads Bibliothek', href: '/tools/ads-library', icon: FileImage, moduleCode: 'ad_generator' },
      { label: 'Content Workflow', href: '/tools/kanban', icon: LayoutGrid, moduleCode: 'kanban' },
    ],
  },
]

function roleLabel(role: TenantShellContext['membership']['role']) {
  return role === 'admin' ? 'Admin' : 'Member'
}

function tenantNav(context: TenantShellContext) {
  const administration: NavItem[] =
    context.membership.role === 'admin'
      ? [
          { label: 'Kunden', href: '/tools/customers', icon: UserRound },
          { label: 'User-Management', href: '/settings/team', icon: Users2 },
          { label: 'Rechtliches & Datenschutz', href: '/settings/legal', icon: ShieldCheck },
          { label: 'Abrechnung', href: '/billing', icon: CreditCard },
        ]
      : []

  return { administration }
}

function isNavActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavigationContent({
  context,
  initialOpenApprovalsCount = 0,
  initialNotifications = [],
  onNavigate,
  inMobileSheet = false,
}: TenantShellNavigationProps & { onNavigate?: () => void; inMobileSheet?: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const { activeCustomer } = useActiveCustomer()
  const activeCustomerId = activeCustomer?.id ?? null
  const sections = tenantNav(context)
  const prefetchedTargets = useRef(new Set<string>())
  const [openApprovalsCount] = useState(initialOpenApprovalsCount)
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const stored = localStorage.getItem('sidebar-sections-open')
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })

  const isSectionOpen = (label: string) => openSections[label] !== false

  const toggleSection = (label: string) => {
    setOpenSections(prev => {
      const next = { ...prev, [label]: !isSectionOpen(label) }
      localStorage.setItem('sidebar-sections-open', JSON.stringify(next))
      return next
    })
  }

  useEffect(() => {
    const updates: Record<string, boolean> = {}
    for (const group of TOOL_GROUPS) {
      const hasActive = group.items.some(item => isNavActive(pathname, item.href))
      if (hasActive && openSections[group.label] === false) {
        updates[group.label] = true
      }
    }
    const adminActive = sections.administration.some(item => isNavActive(pathname, item.href))
    if (adminActive && openSections['Verwaltung'] === false) {
      updates['Verwaltung'] = true
    }
    if (Object.keys(updates).length > 0) {
      setOpenSections(prev => {
        const next = { ...prev, ...updates }
        localStorage.setItem('sidebar-sections-open', JSON.stringify(next))
        return next
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const prefetchJson = useCallback(async (url: string, cacheKey?: string, select?: (data: unknown) => unknown) => {
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json()
    if (cacheKey) {
      writeSessionCache(cacheKey, select ? select(data) : data)
    }
  }, [])

  const prefetchModule = useCallback(
    (href: string) => {
      router.prefetch(href)

      const customerId = activeCustomerId ?? 'all'
      const prefetchId = `${href}:${customerId}`
      if (prefetchedTargets.current.has(prefetchId)) return
      if (prefetchedTargets.current.size >= 50) {
        const oldest = prefetchedTargets.current.values().next().value
        if (oldest !== undefined) prefetchedTargets.current.delete(oldest)
      }
      prefetchedTargets.current.add(prefetchId)

      const customerQuery = activeCustomerId
        ? `?customer_id=${encodeURIComponent(activeCustomerId)}`
        : ''

      const tasks: Promise<void>[] = []

      if (href === '/tools/keywords') {
        tasks.push(
          prefetchJson(
            `/api/tenant/keywords/projects${customerQuery}`,
            `keyword-projects:list:${customerId}`,
            (data) => (data as { projects?: unknown[] }).projects ?? []
          )
        )
      }

      if (href === '/tools/ai-visibility') {
        tasks.push(
          prefetchJson(
            `/api/tenant/visibility/projects${customerQuery}`,
            `ai-visibility:projects:${customerId}`,
            (data) => (data as { projects?: unknown[] }).projects ?? []
          )
        )
      }

      if (href === '/tools/content-briefs') {
        tasks.push(
          prefetchJson(
            `/api/tenant/content/briefs${customerQuery}`,
            `content-briefs:list:${customerId}`,
            (data) => (data as { briefs?: unknown[] }).briefs ?? []
          )
        )
      }

      if (href === '/tools/ads-library') {
        tasks.push(
          prefetchJson(
            `/api/tenant/ad-library${customerQuery}`,
            `ad-library:list:${customerId}:all`,
            (data) => (data as { assets?: unknown[] }).assets ?? []
          )
        )
      }

      if (href === '/tools/kanban') {
        tasks.push(
          prefetchJson(
            '/api/tenant/kanban',
            `kanban:items:${customerId}`,
            (data) => (data as { items?: unknown[] }).items ?? []
          )
        )
      }

      if (href === '/tools/ai-performance') {
        tasks.push(
          prefetchJson(
            `/api/tenant/performance/history${customerQuery}`,
            `ai-performance:history:${customerId}`,
            (data) => (data as { analyses?: unknown[] }).analyses ?? []
          )
        )
      }

      if (href === '/tools/customers') {
        tasks.push(
          prefetchJson(
            '/api/tenant/customers',
            'customers:list',
            (data) => (data as { customers?: unknown[] }).customers ?? []
          )
        )
      }

      void Promise.allSettled(tasks)
    },
    [activeCustomerId, prefetchJson, router]
  )

  const handleNavigate = useCallback(
    (href: string) => {
      if (href !== pathname) {
        setPendingHref(href)
      }
      onNavigate?.()
    },
    [onNavigate, pathname]
  )

  const visiblePendingHref = pendingHref && isNavActive(pathname, pendingHref) ? null : pendingHref

  return (
    <>
      <div className={cn('flex items-center gap-3 px-4 py-4', inMobileSheet && 'pr-14')}>
        {context.tenant.logoUrl ? (
          <Image
            src={context.tenant.logoUrl}
            alt={`${context.tenant.name} Logo`}
            width={160}
            height={48}
            className="h-8 w-auto max-w-[120px] object-contain"
            unoptimized
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-xs font-semibold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
            {context.tenant.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{context.tenant.name}</p>
        </div>
        {!inMobileSheet ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/help"
                onClick={() => handleNavigate('/help')}
                onMouseEnter={() => router.prefetch('/help')}
                onFocus={() => router.prefetch('/help')}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-[#1e2635]/60 dark:hover:text-slate-200"
                aria-label="Hilfe öffnen"
              >
                <CircleHelp className="h-4 w-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Hilfe</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <div data-tour="customer-selector">
        <CustomerSelectorDropdown />
      </div>

      <Separator className="bg-slate-100 dark:bg-slate-800" />

      <nav className="flex-1 px-3 py-3" aria-label="Tenant Navigation" data-tour="sidebar-nav">
        <div className="space-y-6">
          {/* Dashboard — alleinstehend ohne Label */}
          <ul className="space-y-1">
            <li>
              <Link
                href="/dashboard"
                onClick={() => handleNavigate('/dashboard')}
                onMouseEnter={() => router.prefetch('/dashboard')}
                onFocus={() => router.prefetch('/dashboard')}
                className={cn(
                  'flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isNavActive(pathname, '/dashboard')
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1e2635]/60 dark:hover:text-slate-100'
                )}
                aria-current={isNavActive(pathname, '/dashboard') ? 'page' : undefined}
              >
                <span className="flex items-center gap-3">
                  <LayoutDashboard className={cn('h-4 w-4', isNavActive(pathname, '/dashboard') ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500')} />
                  Dashboard
                </span>
                {visiblePendingHref === '/dashboard' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-300 dark:text-slate-600" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                )}
              </Link>
            </li>
          </ul>

          {/* Tool-Gruppen */}
          {TOOL_GROUPS.map((group) => (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggleSection(group.label)}
                className="flex w-full items-center justify-between mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400 transition-colors"
                aria-expanded={isSectionOpen(group.label)}
              >
                {group.label}
                <ChevronRight className={cn('h-3 w-3 transition-transform', isSectionOpen(group.label) ? 'rotate-90' : 'rotate-0')} />
              </button>
              {isSectionOpen(group.label) && <ul className="space-y-1">
                {group.items.map((tool) => {
                  const hasAccess =
                    context.activeModuleCodes.includes('all') ||
                    context.activeModuleCodes.includes(tool.moduleCode) ||
                    ((tool.moduleCode === 'kanban' || tool.moduleCode === 'approvals') &&
                      (context.activeModuleCodes.includes('content_briefs') ||
                        context.activeModuleCodes.includes('ad_generator')))
                  const active = isNavActive(pathname, tool.href)

                  return (
                    <li key={tool.href}>
                      <Link
                        href={tool.href}
                        onClick={() => handleNavigate(tool.href)}
                        onMouseEnter={() => prefetchModule(tool.href)}
                        onFocus={() => prefetchModule(tool.href)}
                        className={cn(
                          'flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors',
                          active
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400'
                            : hasAccess
                              ? 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1e2635]/60 dark:hover:text-slate-100'
                              : 'text-slate-400 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-[#1e2635]/40'
                        )}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span className="flex items-center gap-3">
                          {hasAccess ? (
                            <tool.icon className={cn('h-4 w-4', active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500')} />
                          ) : (
                            <Lock className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                          )}
                          {tool.label}
                        </span>
                        {hasAccess ? (
                          <span className="flex items-center gap-2">
                            {tool.href === '/tools/kanban' && openApprovalsCount > 0 && (
                              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
                                {openApprovalsCount}
                              </span>
                            )}
                            {visiblePendingHref === tool.href ? (
                              <Loader2 className="h-4 w-4 animate-spin text-slate-300 dark:text-slate-600" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                            )}
                          </span>
                        ) : (
                          <Lock className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                        )}
                      </Link>

                    </li>
                  )
                })}
              </ul>}
            </div>
          ))}

          {sections.administration.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => toggleSection('Verwaltung')}
                className="flex w-full items-center justify-between mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400 transition-colors"
                aria-expanded={isSectionOpen('Verwaltung')}
              >
                Verwaltung
                <ChevronRight className={cn('h-3 w-3 transition-transform', isSectionOpen('Verwaltung') ? 'rotate-90' : 'rotate-0')} />
              </button>
              {isSectionOpen('Verwaltung') && <ul className="space-y-1">
                {sections.administration.map((item) => {
                  const active = isNavActive(pathname, item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => handleNavigate(item.href)}
                        onMouseEnter={() => prefetchModule(item.href)}
                        onFocus={() => prefetchModule(item.href)}
                        className={cn(
                          'flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors',
                          active
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1e2635]/60 dark:hover:text-slate-100'
                        )}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span className="flex items-center gap-3">
                          <item.icon className={cn('h-4 w-4', active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500')} />
                          {item.label}
                        </span>
                        {pendingHref === item.href ? (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-300 dark:text-slate-600" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>}
            </div>
          )}
        </div>
      </nav>

      <Separator className="bg-slate-100 dark:bg-slate-800" />

      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm dark:border-border dark:bg-card">
          <Link
            href="/settings/profile"
            onClick={() => handleNavigate('/settings/profile')}
            className="min-w-0 flex flex-1 items-center gap-3 rounded-xl transition hover:bg-slate-50 dark:hover:bg-secondary"
            aria-label="Profil bearbeiten"
          >
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
              <p className="text-xs text-slate-500 dark:text-slate-400">{roleLabel(context.membership.role)}</p>
            </div>
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            <div data-tour="notification-bell">
              <NotificationBell initialNotifications={initialNotifications} />
            </div>
            <ThemeToggle className="shrink-0" />
          </div>
        </div>
      </div>
      <div data-tour="command-palette">
        <GlobalCommandPalette />
      </div>
    </>
  )
}

export function TenantSidebar(props: TenantShellNavigationProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 flex-col overflow-y-auto border-r border-slate-100 bg-white dark:border-border dark:bg-[#080c12] md:flex">
      <NavigationContent {...props} />
    </aside>
  )
}

export function TenantMobileHeader(props: TenantShellNavigationProps) {
  const [open, setOpen] = useState(false)
  const { activeCustomer } = useActiveCustomer()

  return (
    <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-border dark:bg-[#080c12]/95 md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-slate-700 dark:text-slate-300"
        onClick={() => setOpen(true)}
        aria-label="Tenant Navigation öffnen"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex min-w-0 items-center gap-3">
        {props.context.tenant.logoUrl ? (
          <Image
            src={props.context.tenant.logoUrl}
            alt={`${props.context.tenant.name} Logo`}
            width={120}
            height={36}
            className="h-8 w-auto max-w-[110px] shrink-0 object-contain"
            unoptimized
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs font-semibold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
            {props.context.tenant.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{props.context.tenant.name}</p>
          <div className="mt-1 flex items-center gap-2">
            {activeCustomer ? (
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {`Kunde: ${activeCustomer.name}`}
              </p>
            ) : null}
            <Badge className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400 dark:hover:bg-blue-950/50">
              {roleLabel(props.context.membership.role)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <NotificationBell initialNotifications={props.initialNotifications} />
        <Link
          href="/help"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-[#1e2635]/60 dark:hover:text-slate-200"
          aria-label="Hilfe öffnen"
          title="Hilfe"
        >
          <CircleHelp className="h-4 w-4" />
        </Link>
      </div>

      <CustomerSelectorDropdown
        compact
        className="mx-0 my-0 basis-full"
        triggerClassName="w-full max-w-none rounded-xl border-slate-200 bg-slate-50 dark:border-border dark:bg-card"
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[300px] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Tenant Navigation</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col bg-white dark:bg-[#080c12]">
            <NavigationContent {...props} onNavigate={() => setOpen(false)} inMobileSheet />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
