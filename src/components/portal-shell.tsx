'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { BarChart3, Download, LayoutDashboard, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface PortalBranding {
  agencyName: string
  logoUrl: string | null
  primaryColor: string
}

interface PortalVisibility {
  show_ga4: boolean
  show_ads: boolean
  show_seo: boolean
  show_reports: boolean
}

interface PortalShellProps {
  children: ReactNode
  branding: PortalBranding
  visibility: PortalVisibility
  customerName: string
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

function buildNavItems(visibility: PortalVisibility): NavItem[] {
  const items: NavItem[] = [
    {
      href: '/portal/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
  ]

  if (visibility.show_reports) {
    items.push({
      href: '/portal/reports',
      label: 'Reports',
      icon: Download,
    })
  }

  return items
}

export function PortalShell({ children, branding, visibility, customerName }: PortalShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const navItems = buildNavItems(visibility)

  async function handleLogout() {
    await fetch('/api/portal/auth/logout', { method: 'POST' })
    router.push('/portal/login')
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between gap-4 px-5 py-3 shadow-sm"
        style={{ backgroundColor: branding.primaryColor }}
      >
        <div className="flex items-center gap-3">
          {branding.logoUrl ? (
            <Image
              src={branding.logoUrl}
              alt={branding.agencyName}
              width={130}
              height={36}
              className="h-8 w-auto object-contain"
            />
          ) : (
            <span className="text-base font-bold text-white">
              {branding.agencyName || 'Kundenportal'}
            </span>
          )}
          <Badge variant="secondary" className="bg-white/20 text-white border-white/30 text-xs">
            Kundenportal
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-white/80 sm:block">{customerName}</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-white/80 hover:bg-white/20 hover:text-white"
            onClick={() => void handleLogout()}
            aria-label="Abmelden"
          >
            <LogOut className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:block">Abmelden</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar Navigation */}
        <aside className="hidden w-56 shrink-0 border-r bg-white dark:border-slate-800 dark:bg-card sm:block">
          <nav className="p-4 space-y-1" aria-label="Portal Navigation">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Mobile Bottom Nav */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-30 flex border-t bg-white dark:border-slate-800 dark:bg-card sm:hidden"
          aria-label="Mobile Portal Navigation"
        >
          {navItems.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 px-2 py-3 text-xs font-medium transition-colors',
                  active
                    ? 'text-slate-900 dark:text-slate-100'
                    : 'text-slate-500 dark:text-slate-400'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-5 pb-20 sm:pb-5">
          {children}
        </main>
      </div>
    </div>
  )
}

// Placeholder for when no data is available for a section
export function PortalEmptySection({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
      <BarChart3 className="h-8 w-8 text-slate-300 dark:text-slate-600" />
      <div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</p>
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-600">Daten werden vorbereitet.</p>
      </div>
    </div>
  )
}
