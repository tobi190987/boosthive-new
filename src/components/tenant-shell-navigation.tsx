'use client'

import Image from 'next/image'
import { useState, type ComponentType } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Bot,
  ChevronRight,
  CreditCard,
  Eye,
  FileText,
  LayoutDashboard,
  Lock,
  Menu,
  Search,
  UserRound,
  Users2,
} from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getUserDisplayName, getUserInitials } from '@/lib/profile'
import { ThemeToggle } from '@/components/theme-toggle'
import { CustomerSelectorDropdown } from '@/components/customer-selector-dropdown'
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

interface ToolNavItem {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
  moduleCode: string
  children?: ToolNavItem[]
}

const TOOLS: ToolNavItem[] = [
  {
    label: 'SEO Analyse',
    href: '/tools/seo-analyse',
    icon: BarChart3,
    moduleCode: 'seo_analyse',
    children: [
      {
        label: 'Keywordranking',
        href: '/tools/keywords',
        icon: Search,
        moduleCode: 'seo_analyse',
      },
    ],
  },
  { label: 'AI Performance', href: '/tools/ai-performance', icon: Bot, moduleCode: 'ai_performance' },
  { label: 'AI Visibility', href: '/tools/ai-visibility', icon: Eye, moduleCode: 'ai_visibility' },
  { label: 'Content Briefs', href: '/tools/content-briefs', icon: FileText, moduleCode: 'content_briefs' },
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
  onNavigate,
}: TenantShellNavigationProps & { onNavigate?: () => void }) {
  const pathname = usePathname()
  const sections = tenantNav(context)

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-4">
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
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{context.tenant.name}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{context.tenant.slug}.boost-hive.de</p>
        </div>
      </div>

      <CustomerSelectorDropdown />

      <Separator className="bg-slate-100 dark:bg-slate-800" />

      <nav className="flex-1 px-3 py-3" aria-label="Tenant Navigation">
        <div className="space-y-6">
          <div>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
              Workspace
            </p>
            <ul className="space-y-1">
              {/* Dashboard */}
              <li>
                <Link
                  href="/dashboard"
                  onClick={onNavigate}
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
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                </Link>
              </li>

              {/* Tools — direkte Menüpunkte */}
              {TOOLS.map((tool) => {
                const hasAccess = context.activeModuleCodes.includes(tool.moduleCode)
                const active = isNavActive(pathname, tool.href)

                return (
                  <li key={tool.href}>
                    <Link
                      href={tool.href}
                      onClick={onNavigate}
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
                        <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                      ) : (
                        <Lock className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                      )}
                    </Link>

                    {tool.children && tool.children.length > 0 && (
                      <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-100 pl-3 dark:border-[#252d3a]">
                        {tool.children.map((child) => {
                          const childHasAccess = context.activeModuleCodes.includes(child.moduleCode)
                          const childActive = isNavActive(pathname, child.href)

                          return (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                onClick={onNavigate}
                                className={cn(
                                  'flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors',
                                  childActive
                                    ? 'bg-blue-50 font-medium text-blue-600 dark:bg-blue-950/50 dark:text-blue-400'
                                    : childHasAccess
                                      ? 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1e2635]/60 dark:hover:text-slate-100'
                                      : 'text-slate-400 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-[#1e2635]/40'
                                )}
                                aria-current={childActive ? 'page' : undefined}
                              >
                                <span className="flex items-center gap-2.5">
                                  {childHasAccess ? (
                                    <child.icon className={cn('h-3.5 w-3.5', childActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500')} />
                                  ) : (
                                    <Lock className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                                  )}
                                  {child.label}
                                </span>
                                {!childHasAccess && <Lock className="h-3 w-3 text-slate-300 dark:text-slate-600" />}
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {sections.administration.length > 0 && (
            <div>
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                Verwaltung
              </p>
              <ul className="space-y-1">
                {sections.administration.map((item) => {
                  const active = isNavActive(pathname, item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
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
                        <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </nav>

      <Separator className="bg-slate-100 dark:bg-slate-800" />

      <div className="p-4 space-y-2">
        <Link
          href="/settings/profile"
          onClick={onNavigate}
          className="block rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:border-slate-200 hover:bg-slate-50 dark:border-[#252d3a] dark:bg-[#151c28] dark:hover:border-[#2d3847] dark:hover:bg-[#1e2635]"
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
              <p className="text-xs text-slate-500 dark:text-slate-400">{roleLabel(context.membership.role)}</p>
            </div>
            <ThemeToggle className="ml-auto shrink-0" />
          </div>
        </Link>
      </div>
    </>
  )
}

export function TenantSidebar(props: TenantShellNavigationProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 flex-col overflow-y-auto border-r border-slate-100 bg-white dark:border-[#252d3a] dark:bg-[#080c12] md:flex">
      <NavigationContent {...props} />
    </aside>
  )
}

export function TenantMobileHeader(props: TenantShellNavigationProps) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-100 bg-white/95 px-4 backdrop-blur dark:border-[#252d3a] dark:bg-[#080c12]/95 md:hidden">
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

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{props.context.tenant.name}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{roleLabel(props.context.membership.role)}</p>
      </div>

      <div className="ml-auto">
        <Badge className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400 dark:hover:bg-blue-950/50">
          Workspace
        </Badge>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[300px] p-0">
          <div className="flex h-full flex-col bg-white dark:bg-[#080c12]">
            <NavigationContent {...props} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
