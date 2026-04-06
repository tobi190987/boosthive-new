import type { ReactNode } from 'react'
import { TenantMobileHeader, TenantSidebar } from '@/components/tenant-shell-navigation'
import { TenantShellHeader } from '@/components/tenant-shell-header'
import { ActiveCustomerProvider } from '@/lib/active-customer-context'
import type { TenantShellContext } from '@/lib/tenant-shell'

interface TenantAppShellProps {
  context: TenantShellContext
  eyebrow?: string
  title?: string
  description?: string
  showHeader?: boolean
  children: ReactNode
}

export function TenantAppShell({
  context,
  eyebrow,
  title,
  description,
  showHeader = true,
  children,
}: TenantAppShellProps) {
  return (
    <ActiveCustomerProvider tenantSlug={context.tenant.slug}>
      <div className="min-h-screen bg-background text-foreground">
        <div className="flex min-h-screen">
          <TenantSidebar context={context} />
          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <TenantMobileHeader context={context} />
            <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-7xl space-y-6">
                {showHeader && eyebrow && title && description ? (
                  <TenantShellHeader
                    context={context}
                    eyebrow={eyebrow}
                    title={title}
                    description={description}
                  />
                ) : null}
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </ActiveCustomerProvider>
  )
}
