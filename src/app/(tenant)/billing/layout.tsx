import { forbidden, redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function BillingLayout({ children }: { children: ReactNode }) {
  const context = await requireTenantShellContext()

  if (!context.onboarding.isComplete) {
    redirect('/onboarding')
  }

  if (context.membership.role !== 'admin') {
    forbidden()
  }

  return <>{children}</>
}
