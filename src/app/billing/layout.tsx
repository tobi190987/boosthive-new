import { forbidden, redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { TenantAppShell } from '@/components/tenant-app-shell'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function BillingLayout({
  children,
}: {
  children: ReactNode
}) {
  const context = await requireTenantShellContext()

  if (!context.onboarding.isComplete) {
    redirect('/onboarding')
  }

  if (context.membership.role !== 'admin') {
    forbidden()
  }

  return (
    <TenantAppShell
      context={context}
      eyebrow="Abrechnung"
      title="Abo und Zahlungsmethode verwalten"
      description="Hier verwaltest du deinen Basis-Plan, siehst den aktuellen Abo-Status und kannst deine Zahlungsmethode hinterlegen oder ändern."
    >
      {children}
    </TenantAppShell>
  )
}
