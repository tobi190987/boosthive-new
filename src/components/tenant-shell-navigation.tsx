'use client'

import Image from 'next/image'
import { useState, type ComponentType } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Bot,
  CircleUserRound,
  ChevronRight,
  CreditCard,
  Eye,
  LayoutDashboard,
  Lock,
  Menu,
  Search,
  Sparkles,
  Users2,
} from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getUserDisplayName, getUserInitials } from '@/lib/profile'
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
]

function roleLabel(role: TenantShellContext['membership']['role']) {
  return role === 'admin' ? 'Admin' : 'Member'
}

function tenantNav(context: TenantShellContext) {
  const administration: NavItem[] =
    context.membership.role === 'admin'
      ? [
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
  const isToolsActive = pathname.startsWith('/tools')
  const [toolsOpen, setToolsOpen] = useState(isToolsActive)

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
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#edf8f6] text-xs font-semibold text-[#0d9488]">
            {context.tenant.name.slice(0, 1).toUpperCase()}
          </div>
        )}
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
              {/* Dashboard */}
              <li>
                <Link
                  href="/dashboard"
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors',
                    isNavActive(pathname, '/dashboard')
                      ? 'bg-[#edf8f6] text-[#0d9488]'
                      : 'text-slate-600 hover:bg-[#f7f3ed] hover:text-slate-900'
                  )}
                  aria-current={isNavActive(pathname, '/dashboard') ? 'page' : undefined}
                >
                  <span className="flex items-center gap-3">
                    <LayoutDashboard className={cn('h-4 w-4', isNavActive(pathname, '/dashboard') ? 'text-[#0d9488]' : 'text-slate-400')} />
                    Dashboard
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </Link>
              </li>

              {/* Tools — expandable category */}
              <li>
                <button
                  type="button"
                  onClick={() => setToolsOpen((v) => !v)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors',
                    isToolsActive
                      ? 'bg-[#edf8f6] text-[#0d9488]'
                      : 'text-slate-600 hover:bg-[#f7f3ed] hover:text-slate-900'
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Sparkles className={cn('h-4 w-4', isToolsActive ? 'text-[#0d9488]' : 'text-slate-400')} />
                    Tools
                  </span>
                  <ChevronRight className={cn('h-4 w-4 text-slate-300 transition-transform', toolsOpen && 'rotate-90')} />
                </button>

                {toolsOpen && (
                  <ul className="ml-4 mt-1 space-y-0.5 border-l border-[#ebe2d5] pl-3">
                    {TOOLS.map((tool) => {
                      const hasAccess = context.activeModuleCodes.includes(tool.moduleCode)
                      const active = isNavActive(pathname, tool.href)

                      return (
                        <li key={tool.href}>
                          <Link
                            href={tool.href}
                            onClick={onNavigate}
                            className={cn(
                              'flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors',
                              active
                                ? 'bg-[#edf8f6] font-medium text-[#0d9488]'
                                : hasAccess
                                  ? 'text-slate-600 hover:bg-[#f7f3ed] hover:text-slate-900'
                                  : 'text-slate-400 hover:bg-[#f7f3ed]'
                            )}
                            aria-current={active ? 'page' : undefined}
                          >
                            <span className="flex items-center gap-2.5">
                              {hasAccess ? (
                                <tool.icon className={cn('h-3.5 w-3.5', active ? 'text-[#0d9488]' : 'text-slate-400')} />
                              ) : (
                                <Lock className="h-3.5 w-3.5 text-slate-300" />
                              )}
                              {tool.label}
                            </span>
                            {!hasAccess && <Lock className="h-3 w-3 text-slate-300" />}
                          </Link>

                          {tool.children && tool.children.length > 0 ? (
                            <ul className="ml-4 mt-1 space-y-0.5 border-l border-[#ebe2d5] pl-3">
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
                                          ? 'bg-[#edf8f6] font-medium text-[#0d9488]'
                                          : childHasAccess
                                            ? 'text-slate-600 hover:bg-[#f7f3ed] hover:text-slate-900'
                                            : 'text-slate-400 hover:bg-[#f7f3ed]'
                                      )}
                                      aria-current={childActive ? 'page' : undefined}
                                    >
                                      <span className="flex items-center gap-2.5">
                                        {childHasAccess ? (
                                          <child.icon
                                            className={cn('h-3.5 w-3.5', childActive ? 'text-[#0d9488]' : 'text-slate-400')}
                                          />
                                        ) : (
                                          <Lock className="h-3.5 w-3.5 text-slate-300" />
                                        )}
                                        {child.label}
                                      </span>
                                      {!childHasAccess && <Lock className="h-3 w-3 text-slate-300" />}
                                    </Link>
                                  </li>
                                )
                              })}
                            </ul>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
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
                        href={item.href}
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
                          <item.icon className={cn('h-4 w-4', active ? 'text-[#0d9488]' : 'text-slate-400')} />
                          {item.label}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
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

      <div className="p-4">
        <Link
          href="/settings/profile"
          onClick={onNavigate}
          className="block rounded-[26px] border border-[#ebe2d5] bg-white p-3 shadow-sm transition hover:border-[#d7ccbc] hover:bg-[#fffdf9]"
        >
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-[#dceee9]">
              <AvatarImage src={context.user.avatarUrl ?? undefined} alt={context.user.email} />
              <AvatarFallback className="bg-[#e8f8f3] text-sm font-semibold text-[#0d9488]">
                {getUserInitials(
                  { first_name: context.user.firstName, last_name: context.user.lastName },
                  context.user.email
                )}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {getUserDisplayName(
                  { first_name: context.user.firstName, last_name: context.user.lastName },
                  context.user.email
                )}
              </p>
              <p className="text-xs text-slate-500">{roleLabel(context.membership.role)}</p>
            </div>
            <CircleUserRound className="ml-auto h-4 w-4 text-slate-300" />
          </div>
        </Link>
      </div>
    </>
  )
}

export function TenantSidebar(props: TenantShellNavigationProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 flex-col overflow-y-auto border-r border-[#ebe2d5] bg-[#fffaf3] md:flex">
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
        aria-label="Tenant Navigation öffnen"
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
