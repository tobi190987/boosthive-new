import type { ReactNode } from 'react'
import { TenantAppShell } from '@/components/tenant-app-shell'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode
}) {
  const context = await requireTenantShellContext()

  return (
    <TenantAppShell
      context={context}
      eyebrow="Profil & Einstellungen"
      title="Persoenliche Daten und Workspace-Verwaltung"
      description="Profil, Team und die administrativen Einstellungen laufen ueber dieselbe Tenant-Shell, damit Rollen und Kontext konsistent bleiben."
    >
      {children}
    </TenantAppShell>
  )
}
