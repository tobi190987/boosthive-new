'use client'

import { Building2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Customer } from '@/lib/active-customer-context'

interface CustomerAssignmentFieldProps {
  value: string
  onChange: (value: string) => void
  customers: Customer[]
  loading?: boolean
  label?: string
  description?: string
  placeholder?: string
  noneLabel?: string
  triggerClassName?: string
}

export function CustomerAssignmentField({
  value,
  onChange,
  customers,
  loading = false,
  label = 'Kunde',
  description = 'Optional. Du kannst den Vorgang direkt einem Kunden zuordnen oder tenant-weit anlegen.',
  placeholder = 'Kunde auswählen',
  noneLabel = 'Ohne Kunde',
  triggerClassName,
}: CustomerAssignmentFieldProps) {
  const selectedCustomer = value === 'none'
    ? null
    : customers.find((customer) => customer.id === value) ?? null

  return (
    <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-border dark:bg-card">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <Building2 className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
        </div>
        <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      </div>

      {loading ? (
        <Skeleton className="h-11 w-full rounded-xl" />
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className={triggerClassName}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{noneLabel}</SelectItem>
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.name}{customer.domain ? ` (${customer.domain})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selectedCustomer ? (
        <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">
          Zugeordnet zu <span className="font-medium">{selectedCustomer.name}</span>
          {selectedCustomer.domain ? ` (${selectedCustomer.domain})` : ''}.
        </p>
      ) : (
        <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
          Der Vorgang wird ohne feste Kundenzuordnung gespeichert.
        </p>
      )}
    </div>
  )
}
