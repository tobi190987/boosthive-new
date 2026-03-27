import type { ReactNode } from 'react'
import { TenantMobileHeader, TenantSidebar } from '@/components/tenant-shell-navigation'
import { TenantShellHeader } from '@/components/tenant-shell-header'
import type { TenantShellContext } from '@/lib/tenant-shell'

interface TenantAppShellProps {
  context: TenantShellContext
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}

export function TenantAppShell({
  context,
  eyebrow,
  title,
  description,
  children,
}: TenantAppShellProps) {
  return (
    <div className="min-h-screen bg-[#f7f2ea] text-slate-900">
      <div className="flex min-h-screen">
        <TenantSidebar context={context} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <TenantMobileHeader context={context} />
          <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl space-y-6">
              <TenantShellHeader
                context={context}
                eyebrow={eyebrow}
                title={title}
                description={description}
              />
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
