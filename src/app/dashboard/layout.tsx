import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { TenantAppShell } from '@/components/tenant-app-shell'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function DashboardLayout({
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
      eyebrow="Tenant Shell"
      title="Dein Tenant-Workspace auf einen Blick"
      description="Header, Navigation und Rollen-Kontext laufen jetzt über eine gemeinsame Tenant-Shell für Dashboard, Team und die kommenden Produktmodule."
    >
      {children}
    </TenantAppShell>
  )
}
