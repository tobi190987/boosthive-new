'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShieldCheck, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/settings/profile', label: 'Profil', icon: UserRound },
  { href: '/settings/legal', label: 'Rechtliches & Datenschutz', icon: ShieldCheck },
]

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SettingsProfileTabs() {
  const pathname = usePathname()

  return (
    <div className="mb-4">
      <nav className="inline-flex rounded-full bg-slate-100 p-1 dark:bg-[#1e2635]" aria-label="Profil Tabs">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors',
                active
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-[#151c28] dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
