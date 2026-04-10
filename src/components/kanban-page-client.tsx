'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ApprovalsWorkspace } from '@/components/approvals-workspace'
import { KanbanWorkspace } from '@/components/kanban-workspace'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useActiveCustomer } from '@/lib/active-customer-context'
import { cn } from '@/lib/utils'

interface KanbanPageClientProps {
  openApprovalsCount: number
}

export function KanbanPageClient({ openApprovalsCount }: KanbanPageClientProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeCustomer, customers } = useActiveCustomer()

  const tab = searchParams.get('tab') === 'approvals' ? 'approvals' : 'board'
  const customerParam = searchParams.get('customerId')
  const selectedCustomerId =
    customerParam === 'all' ? null : customerParam ?? undefined
  const effectiveCustomerId =
    selectedCustomerId === undefined ? activeCustomer?.id ?? null : selectedCustomerId

  const customerQueryValue = effectiveCustomerId ?? 'all'
  const customerLabel = useMemo(() => {
    if (!effectiveCustomerId) return null
    return customers.find((customer) => customer.id === effectiveCustomerId)?.name ?? null
  }, [customers, effectiveCustomerId])

  const buildHref = (nextTab: 'board' | 'approvals', nextCustomerId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', nextTab)

    params.set('customerId', nextCustomerId)

    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }

  return (
    <>
      <div className="px-6 pb-2">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Kunde für Board und Freigaben
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Die Auswahl gilt für beide Tabs gemeinsam.
              </p>
            </div>
            <Select
              value={customerQueryValue}
              onValueChange={(value) => {
                router.push(buildHref(tab, value))
              }}
            >
              <SelectTrigger className="w-full lg:w-[280px]">
                <SelectValue placeholder="Kunde auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kunden</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id} className="pr-10">
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="truncate">{customer.name}</span>
                      {customer.openApprovalsCount ? (
                        <Badge className="h-5 min-w-5 shrink-0 justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white hover:bg-orange-500">
                          {customer.openApprovalsCount}
                        </Badge>
                      ) : null}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-1 border-b border-slate-200 dark:border-border">
              <Link
                href={buildHref('board', customerQueryValue)}
                className={cn(
                  'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                  tab === 'board'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                )}
              >
                Board
              </Link>
              <Link
                href={buildHref('approvals', customerQueryValue)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                  tab === 'approvals'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                )}
              >
                Freigaben
                {openApprovalsCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
                    {openApprovalsCount}
                  </span>
                )}
              </Link>
            </div>
            {customerLabel ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Aktiver Filter: {customerLabel}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {tab === 'board' ? (
        <KanbanWorkspace selectedCustomerId={selectedCustomerId} />
      ) : (
        <ApprovalsWorkspace selectedCustomerId={selectedCustomerId} />
      )}
    </>
  )
}
