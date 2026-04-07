'use client'

import Link from 'next/link'
import { Users2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useActiveCustomer } from '@/lib/active-customer-context'

interface NoCustomerSelectedProps {
  /** Tool-Name für den Kontext-Text (z.B. "AI Performance") */
  toolName?: string
}

export function NoCustomerSelected({ toolName }: NoCustomerSelectedProps) {
  const { customers } = useActiveCustomer()
  const hasCustomers = customers.length > 0

  return (
    <Card className="rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:border-slate-800 dark:bg-card dark:bg-slate-950">
      <CardContent className="flex flex-col items-center gap-5 px-6 py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50">
          <Users2 className="h-7 w-7 text-blue-500 dark:text-blue-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">
            Kein Kunde ausgewählt
          </h2>
          <p className="max-w-md text-sm leading-7 text-slate-600 dark:text-slate-300 dark:text-slate-400">
            {hasCustomers
              ? `Wähle zuerst einen Kunden im Selektor aus, um ${toolName ? `die ${toolName}-Daten` : 'die Analyse-Daten'} anzuzeigen.`
              : `Lege zuerst einen Kunden an, um ${toolName ? `${toolName}` : 'die Analyse-Tools'} nutzen zu können.`}
          </p>
        </div>
        {!hasCustomers && (
          <Button asChild variant="dark">
            <Link href="/tools/customers">Kunden verwalten</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
