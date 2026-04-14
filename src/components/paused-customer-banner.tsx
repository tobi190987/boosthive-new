'use client'

import { AlertTriangle } from 'lucide-react'
import { useActiveCustomer } from '@/lib/active-customer-context'

export function PausedCustomerBanner() {
  const { activeCustomer } = useActiveCustomer()

  if (!activeCustomer || activeCustomer.status !== 'paused') return null

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        <span className="font-semibold">{activeCustomer.name}</span> ist pausiert — Daten werden
        angezeigt, aber neue Kampagnen und Analysen sind eingeschränkt.
      </span>
    </div>
  )
}
