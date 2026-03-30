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
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-xs font-semibold text-blue-600">
            {context.tenant.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{context.tenant.name}</p>
          <p className="truncate text-xs text-slate-500">{context.tenant.slug}.boost-hive.de</p>
        </div>
      </div>

      <Separator className="bg-slate-100" />

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
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  )}
                  aria-current={isNavActive(pathname, '/dashboard') ? 'page' : undefined}
                >
                  <span className="flex items-center gap-3">
                    <LayoutDashboard className={cn('h-4 w-4', isNavActive(pathname, '/dashboard') ? 'text-blue-600' : 'text-slate-400')} />
                    Dashboard
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
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
                          ? 'bg-blue-50 text-blue-600'
                          : hasAccess
                            ? 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            : 'text-slate-400 hover:bg-slate-50'
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className="flex items-center gap-3">
                        {hasAccess ? (
                          <tool.icon className={cn('h-4 w-4', active ? 'text-blue-600' : 'text-slate-400')} />
                        ) : (
                          <Lock className="h-4 w-4 text-slate-300" />
                        )}
                        {tool.label}
                      </span>
                      {hasAccess ? (
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      ) : (
                        <Lock className="h-3.5 w-3.5 text-slate-300" />
                      )}
                    </Link>

                    {tool.children && tool.children.length > 0 && (
                      <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-100 pl-3">
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
                                    ? 'bg-blue-50 font-medium text-blue-600'
                                    : childHasAccess
                                      ? 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                      : 'text-slate-400 hover:bg-slate-50'
                                )}
                                aria-current={childActive ? 'page' : undefined}
                              >
                                <span className="flex items-center gap-2.5">
                                  {childHasAccess ? (
                                    <child.icon className={cn('h-3.5 w-3.5', childActive ? 'text-blue-600' : 'text-slate-400')} />
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
                    )}
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
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          'flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors',
                          active
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        )}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span className="flex items-center gap-3">
                          <item.icon className={cn('h-4 w-4', active ? 'text-blue-600' : 'text-slate-400')} />
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

      <Separator className="bg-slate-100" />

      <div className="p-4">
        <Link
          href="/settings/profile"
          onClick={onNavigate}
          className="block rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:border-slate-200 hover:bg-slate-50"
        >
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-slate-100">
              <AvatarImage src={context.user.avatarUrl ?? undefined} alt={context.user.email} />
              <AvatarFallback className="bg-blue-50 text-sm font-semibold text-blue-600">
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
    <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 flex-col overflow-y-auto border-r border-slate-100 bg-white md:flex">
      <NavigationContent {...props} />
    </aside>
  )
}

export function TenantMobileHeader(props: TenantShellNavigationProps) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-100 bg-white/95 px-4 backdrop-blur md:hidden">
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
        <Badge className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50">
          Workspace
        </Badge>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[300px] p-0">
          <div className="flex h-full flex-col bg-white">
            <NavigationContent {...props} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
