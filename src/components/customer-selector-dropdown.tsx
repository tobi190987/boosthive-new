'use client'

import { useCallback, useState } from 'react'
import { Check, ChevronsUpDown, Users2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { useActiveCustomer, type Customer } from '@/lib/active-customer-context'

interface CustomerSelectorDropdownProps {
  className?: string
  triggerClassName?: string
  compact?: boolean
}

function StatusDot({ status }: { status: Customer['status'] }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        status === 'active' ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
      )}
      aria-label={status === 'active' ? 'Aktiv' : 'Pausiert'}
    />
  )
}

export function CustomerSelectorDropdown({
  className,
  triggerClassName,
  compact = false,
}: CustomerSelectorDropdownProps) {
  const { activeCustomer, customers, loading, setActiveCustomer } = useActiveCustomer()
  const [open, setOpen] = useState(false)

  const handleSelect = useCallback(
    (customerId: string) => {
      if (activeCustomer?.id === customerId) {
        setActiveCustomer(null)
      } else {
        const customer = customers.find((c) => c.id === customerId) ?? null
        setActiveCustomer(customer)
      }
      setOpen(false)
    },
    [activeCustomer, customers, setActiveCustomer]
  )

  if (loading) {
    return (
      <div
        className={cn(
          'mx-3 mt-2 mb-1 flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-border dark:bg-card/50 dark:border-slate-800 dark:bg-slate-900/50',
          className,
          triggerClassName
        )}
      >
        <div className="h-4 w-4 animate-pulse rounded bg-slate-200 dark:bg-[#252d3a] dark:bg-slate-700" />
        <div className="h-4 flex-1 animate-pulse rounded bg-slate-200 dark:bg-[#252d3a] dark:bg-slate-700" />
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Kunden auswählen"
          className={cn(
            'mx-3 mt-2 mb-1 flex w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
            'border-slate-100 dark:border-border bg-slate-50 dark:bg-card/50 hover:border-slate-200 hover:bg-slate-50 dark:hover:bg-[#1e2635]',
            'dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700 dark:hover:bg-slate-800/60',
            className,
            triggerClassName
          )}
        >
          {activeCustomer ? (
            <>
              <StatusDot status={activeCustomer.status} />
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900 dark:text-slate-100">
                  {activeCustomer.name}
                </span>
                {!compact && activeCustomer.domain && (
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    {activeCustomer.domain}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <Users2 className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-slate-400 dark:text-slate-500">
                  {customers.length === 0 ? 'Noch keine Kunden' : 'Kunde wählen'}
                </span>
              </div>
            </>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[252px] p-0" align="start" sideOffset={4}>
        <Command>
          <CommandInput placeholder="Kunde suchen..." />
          <CommandList>
            <CommandEmpty>
              {customers.length === 0 ? 'Noch keine Kunden angelegt.' : 'Kein Kunde gefunden.'}
            </CommandEmpty>
            <CommandGroup>
              {customers.map((customer) => (
                <CommandItem
                  key={customer.id}
                  value={`${customer.name} ${customer.domain ?? ''}`}
                  onSelect={() => handleSelect(customer.id)}
                  className="flex items-center gap-2.5"
                >
                  <StatusDot status={customer.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100 dark:text-slate-100">
                      {customer.name}
                    </p>
                    {customer.domain && (
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400 dark:text-slate-400">
                        {customer.domain}
                      </p>
                    )}
                  </div>
                  {activeCustomer?.id === customer.id && (
                    <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
