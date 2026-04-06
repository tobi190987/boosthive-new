import type { ReactNode } from 'react'
import { TenantAppShell } from '@/components/tenant-app-shell'
import { getTenantShellSummary } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function TenantLayout({ children }: { children: ReactNode }) {
  const context = await requireTenantShellContext()
  const shellSummary = await getTenantShellSummary(context.tenant.id, context.user.id)

  return (
    <TenantAppShell context={context} shellSummary={shellSummary}>
      {children}
    </TenantAppShell>
  )
}
