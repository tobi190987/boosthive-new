import type { ReactNode } from 'react'
import { TenantMobileHeader, TenantSidebar } from '@/components/tenant-shell-navigation'
import { TenantShellHeader } from '@/components/tenant-shell-header'
import { AppBreadcrumb } from '@/components/app-breadcrumb'
import { OnboardingTour } from '@/components/onboarding-tour'
import { ActiveCustomerProvider } from '@/lib/active-customer-context'
import type { TenantShellSummary } from '@/lib/tenant-app-data'
import type { TenantShellContext } from '@/lib/tenant-shell'

interface TenantAppShellProps {
  context: TenantShellContext
  shellSummary: TenantShellSummary
  eyebrow?: string
  title?: string
  description?: string
  showHeader?: boolean
  children: ReactNode
}

export function TenantAppShell({
  context,
  shellSummary,
  eyebrow,
  title,
  description,
  showHeader = true,
  children,
}: TenantAppShellProps) {
  return (
    <ActiveCustomerProvider
      tenantSlug={context.tenant.slug}
      initialCustomers={shellSummary.customers}
    >
      <div className="min-h-screen bg-background text-foreground">
        <OnboardingTour
          tenantId={context.tenant.id}
          userId={context.user.id}
          enabled={context.onboarding.isComplete}
        />
        <div className="flex min-h-screen">
          <TenantSidebar
            context={context}
            initialOpenApprovalsCount={shellSummary.openApprovalsCount}
            initialNotifications={shellSummary.notifications}
          />
          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <TenantMobileHeader
              context={context}
              initialOpenApprovalsCount={shellSummary.openApprovalsCount}
              initialNotifications={shellSummary.notifications}
            />
            <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-7xl space-y-6">
                <AppBreadcrumb />
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
