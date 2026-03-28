import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { TenantAppShell } from '@/components/tenant-app-shell'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function ToolsLayout({
  children,
}: {
  children: ReactNode
}) {
  const context = await requireTenantShellContext()

  if (!context.onboarding.isComplete) {
    redirect('/onboarding')
  }

  return (
    <TenantAppShell
      context={context}
      eyebrow="Tools"
      title="SEO-Analyse"
      description=""
    >
      {children}
    </TenantAppShell>
  )
}
