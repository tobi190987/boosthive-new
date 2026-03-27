import type { ReactNode } from 'react'
import { TenantAppShell } from '@/components/tenant-app-shell'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const context = await requireTenantShellContext()

  return (
    <TenantAppShell
      context={context}
      eyebrow="Tenant Shell"
      title="Dein Tenant-Workspace auf einen Blick"
      description="Header, Navigation und Rollen-Kontext laufen jetzt ueber eine gemeinsame Tenant-Shell fuer Dashboard, Team und die kommenden Produktmodule."
    >
      {children}
    </TenantAppShell>
  )
}
