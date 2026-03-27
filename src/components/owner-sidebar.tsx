"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Building2, User, Menu, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"

const navItems = [
  {
    section: "SYSTEM",
    items: [
      { label: "Dashboard", href: "/owner", icon: LayoutDashboard },
      { label: "Agenturen", href: "/owner/tenants", icon: Building2 },
    ],
  },
]

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/owner/login'
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === "/owner") return pathname === "/owner"
    return pathname.startsWith(href)
  }

  return (
    <>
      <Separator className="bg-slate-100" />
      <nav className="flex-1 px-3 py-3">
        {navItems.map((section) => (
          <div key={section.section}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {section.section}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "border-l-2 border-[#1dbfaa] bg-[#f0fdfb] text-[#0d9488]"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-[#1dbfaa]" : "text-slate-400")} />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <Separator className="bg-slate-100" />

      <div className="px-3 py-3 space-y-0.5">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f0fdfb] ring-1 ring-[#d1faf4]">
            <User className="h-3.5 w-3.5 text-[#0d9488]" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">Admin</p>
            <p className="text-xs text-slate-400">Owner</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
        >
          <LogOut className="h-4 w-4 text-slate-400" />
          Abmelden
        </button>
      </div>
    </>
  )
}

export function OwnerSidebar() {
  return (
    <aside className="hidden md:flex h-screen w-[200px] flex-col border-r border-slate-100 bg-white" aria-label="Owner Navigation">
      <div className="flex h-14 items-center px-4">
        <Link href="/owner" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/favicon_dark.png"
            alt=""
            width={32}
            height={32}
            style={{ mixBlendMode: 'multiply' }}
            className="h-8 w-8 object-contain"
          />
          <span className="text-sm font-semibold tracking-tight">
            <span className="text-slate-800">Boost</span><span className="text-[#0d9488]">Hive</span>
          </span>
        </Link>
      </div>
      <NavContent />
    </aside>
  )
}

export function OwnerMobileHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="flex md:hidden h-14 shrink-0 items-center border-b border-slate-100 bg-white px-4 gap-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Navigation öffnen"
        className="text-slate-600"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Link href="/owner" className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/favicon_dark.png"
          alt=""
          width={32}
          height={32}
          style={{ mixBlendMode: 'multiply' }}
          className="h-8 w-8 object-contain"
        />
        <span className="text-sm font-semibold tracking-tight">
          <span className="text-slate-800">Boost</span><span className="text-[#0d9488]">Hive</span>
        </span>
      </Link>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[200px] p-0 flex flex-col">
          <div className="flex h-14 items-center px-4 border-b border-slate-100">
            <Link href="/owner" onClick={() => setOpen(false)} className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/favicon_dark.png"
                alt=""
                width={32}
                height={32}
                style={{ mixBlendMode: 'multiply' }}
                className="h-8 w-8 object-contain"
              />
              <span className="text-sm font-semibold tracking-tight">
                <span className="text-slate-800">Boost</span><span className="text-[#0d9488]">Hive</span>
              </span>
            </Link>
          </div>
          <NavContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  )
}
