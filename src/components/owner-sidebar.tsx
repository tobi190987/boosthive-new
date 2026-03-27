"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Building2, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"

const navItems = [
  {
    section: "SYSTEM",
    items: [
      { label: "Dashboard", href: "/owner", icon: LayoutDashboard },
      { label: "Agenturen", href: "/owner/tenants", icon: Building2 },
    ],
  },
]

export function OwnerSidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === "/owner") {
      return pathname === "/owner"
    }
    return pathname.startsWith(href)
  }

  return (
    <aside className="flex h-screen w-[220px] flex-col border-r bg-white" aria-label="Owner Navigation">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <Link href="/owner" className="text-xl font-bold tracking-tight">
          <span className="text-gray-900">Boost</span>
          <span className="text-teal-500">Hive</span>
        </Link>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        {navItems.map((section) => (
          <div key={section.section}>
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              {section.section}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "border-l-2 border-teal-500 bg-teal-50 text-teal-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <item.icon className={cn("h-4 w-4", active ? "text-teal-500" : "text-gray-400")} />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <Separator />

      {/* User info */}
      <div className="flex items-center gap-3 px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100">
          <User className="h-4 w-4 text-teal-600" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">Admin</p>
          <p className="text-xs text-gray-500">Owner</p>
        </div>
      </div>
    </aside>
  )
}
