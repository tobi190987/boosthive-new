import type { Metadata } from 'next'
import { ExportsWorkspace } from '@/components/exports-workspace'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export const metadata: Metadata = {
  title: 'Reporting & Export Center — BoostHive',
}

export default async function ExportsPage() {
  const context = await requireTenantShellContext()

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          Reporting & Export Center
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Erstelle gebrandete Berichte als PDF, PNG oder XLSX und versende sie direkt an deine Kunden.
        </p>
      </div>
      <ExportsWorkspace
        tenantName={context.tenant.name}
        tenantLogoUrl={context.tenant.logoUrl}
      />
    </>
  )
}
