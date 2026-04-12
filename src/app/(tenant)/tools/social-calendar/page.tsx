import { Plus } from 'lucide-react'
import Link from 'next/link'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { CustomerSelectorDropdown } from '@/components/customer-selector-dropdown'
import { SocialCalendarWorkspace } from '@/components/social-calendar-workspace'
import { Button } from '@/components/ui/button'

export default async function SocialCalendarPage() {
  const context = await requireTenantShellContext()
  const hasAccess =
    context.activeModuleCodes.includes('social_calendar') ||
    context.activeModuleCodes.includes('all')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="Social Media Kalender" isAdmin={isAdmin} />
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            Social Media Kalender
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Plane und verwalte Social-Media-Posts für alle Plattformen.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          <div className="w-full sm:w-[280px]">
            <CustomerSelectorDropdown
              className="mx-0 my-0 w-full"
              triggerClassName="mx-0 my-0 w-full"
              compact
            />
          </div>
          <Button asChild variant="dark" className="gap-2 self-start">
            <Link href="/tools/social-calendar?action=create">
              <Plus className="h-4 w-4" />
              Neuer Post
            </Link>
          </Button>
        </div>
      </div>
      <SocialCalendarWorkspace />
    </>
  )
}
