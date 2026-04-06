import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function ToolsLayout({ children }: { children: ReactNode }) {
  const context = await requireTenantShellContext()

  if (!context.onboarding.isComplete) {
    redirect('/onboarding')
  }

  return <>{children}</>
}
