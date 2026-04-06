import type { ReactNode } from 'react'
import { TenantAppShell } from '@/components/tenant-app-shell'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function TenantLayout({ children }: { children: ReactNode }) {
  const context = await requireTenantShellContext()

  return (
    <TenantAppShell context={context}>
      {children}
    </TenantAppShell>
  )
}
