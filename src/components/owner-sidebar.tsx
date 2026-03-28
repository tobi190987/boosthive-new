'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { getUserDisplayName, getUserInitials } from '@/lib/profile'
import type { OwnerShellContext } from '@/lib/owner-shell'
import { cn } from '@/lib/utils'

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
}: {
  context: OwnerShellContext
  onNavigate?: () => void
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
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#edf8f6]">
          <Image
            src="/favicon_dark.png"
            alt="BoostHive"
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">BoostHive Owner</p>
          <p className="truncate text-xs text-slate-500">root.boost-hive.de</p>
        </div>
      </div>

      <Separator className="bg-[#ebe2d5]" />

      <nav className="flex-1 px-3 py-3" aria-label="Owner Navigation">
        {navItems.map((section) => (
          <div key={section.section} className="space-y-2">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              {section.section}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.href)
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
                        <item.icon
                          className={cn(
                            'h-4 w-4 shrink-0',
                            active ? 'text-[#0d9488]' : 'text-slate-400'
                          )}
                        />
                        {item.label}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <Separator className="bg-[#ebe2d5]" />

      <div className="p-4 space-y-3">
        <Link
          href="/owner/profile"
          onClick={onNavigate}
          className="block rounded-[26px] border border-[#ebe2d5] bg-white p-3 shadow-sm transition hover:border-[#d7ccbc] hover:bg-[#fffdf9]"
        >
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-[#dceee9]">
              <AvatarImage src={context.user.avatarUrl ?? undefined} alt={context.user.email} />
              <AvatarFallback className="bg-[#e8f8f3] text-sm font-semibold text-[#0d9488]">
                {getUserInitials(
                  {
                    first_name: context.user.firstName,
                    last_name: context.user.lastName,
                  },
                  context.user.email
                )}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {getUserDisplayName(
                  {
                    first_name: context.user.firstName,
                    last_name: context.user.lastName,
                  },
                  context.user.email
                )}
              </p>
              <p className="text-xs text-slate-500">Owner</p>
            </div>
            <CircleUserRound className="ml-auto h-4 w-4 text-slate-300" />
          </div>
        </Link>

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-[#f7f3ed] hover:text-slate-700"
        >
          <LogOut className="h-4 w-4 text-slate-400" />
          Abmelden
        </button>
      </div>
    </>
  )
}

export function OwnerSidebar({ context }: { context: OwnerShellContext }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 flex-col overflow-y-auto border-r border-[#ebe2d5] bg-[#fffaf3] md:flex">
      <NavContent context={context} />
    </aside>
  )
}

export function OwnerMobileHeader({ context }: { context: OwnerShellContext }) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[#ebe2d5] bg-[#fffaf3]/95 px-4 backdrop-blur md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Owner Navigation öffnen"
        className="text-slate-700"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">BoostHive Owner</p>
        <p className="truncate text-xs text-slate-500">{context.user.email}</p>
      </div>

      <div className="ml-auto">
        <Badge className="rounded-full bg-[#edf8f6] text-[#0d9488] hover:bg-[#edf8f6]">
          Plattform
        </Badge>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[300px] p-0">
          <div className="flex h-full flex-col bg-[#fffaf3]">
            <NavContent context={context} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
