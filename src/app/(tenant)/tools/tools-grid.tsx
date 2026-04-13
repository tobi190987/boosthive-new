'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CreditCard, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TOOL_GROUPS, COLOR_MAP, type ToolItem } from '@/lib/tool-groups'

function hasToolAccess(moduleCode: string, activeCodes: string[]): boolean {
  return (
    activeCodes.includes('all') ||
    activeCodes.includes(moduleCode) ||
    ((moduleCode === 'kanban' || moduleCode === 'approvals') &&
      (activeCodes.includes('content_briefs') || activeCodes.includes('ad_generator')))
  )
}

function LockedToolCard({ tool }: { tool: ToolItem }) {
  const [open, setOpen] = useState(false)
  const Icon = tool.icon

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative flex w-full flex-col gap-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-5 text-left transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-border/60 dark:bg-card/50 dark:hover:border-[#3d4a5c]"
      >
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800/60">
            <Lock className="h-5 w-5 text-slate-400 dark:text-slate-600" />
          </div>
          <Badge
            variant="outline"
            className="text-[10px] border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-600"
          >
            Gesperrt
          </Badge>
        </div>
        <div>
          <p className="font-semibold text-slate-400 dark:text-slate-600">{tool.label}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-400 dark:text-slate-500">
            {tool.description}
          </p>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${COLOR_MAP[tool.color].bg}`}>
                <Icon className={`h-4 w-4 ${COLOR_MAP[tool.color].icon}`} />
              </div>
              {tool.label}
            </DialogTitle>
            <DialogDescription className="pt-1">
              {tool.description}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400">
            Dieses Modul ist in deinem aktuellen Tarif nicht enthalten. Aktiviere es unter <strong>Abrechnung</strong>, um Zugriff zu erhalten.
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Schließen
            </Button>
            <Button asChild>
              <Link href="/billing" onClick={() => setOpen(false)}>
                <CreditCard className="mr-2 h-4 w-4" />
                Zur Abrechnung
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ToolsGrid({ activeCodes }: { activeCodes: string[] }) {
  return (
    <>
      {TOOL_GROUPS.map((group) => (
        <div key={group.label}>
          <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
            {group.label}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.filter((tool) => tool.showInGrid !== false).map((tool) => {
              const hasAccess = hasToolAccess(tool.moduleCode, activeCodes)
              const colors = COLOR_MAP[tool.color]
              const Icon = tool.icon

              if (!hasAccess) {
                return <LockedToolCard key={tool.href} tool={tool} />
              }

              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="group relative flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-soft transition-all hover:border-slate-200 hover:shadow-md dark:border-border dark:bg-card dark:hover:border-[#3d4a5c]"
                >
                  <div className="flex items-start justify-between">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.bg}`}>
                      <Icon className={`h-5 w-5 ${colors.icon}`} />
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{tool.label}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                      {tool.description}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}
