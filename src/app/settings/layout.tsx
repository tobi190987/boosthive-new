import { forbidden } from 'next/navigation'
import type { ReactNode } from 'react'
import { TenantAppShell } from '@/components/tenant-app-shell'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode
}) {
  const context = await requireTenantShellContext()

  if (context.membership.role !== 'admin') {
    forbidden()
  }

  return (
    <TenantAppShell
      context={context}
      eyebrow="Tenant Admin"
      title="Verwaltung und Team sauber gebuendelt"
      description="Admin-Routen bleiben serverseitig geschützt und nutzen dieselbe Tenant-Shell wie das Dashboard, damit Navigation und Kontext konsistent bleiben."
    >
      {children}
    </TenantAppShell>
  )
}
