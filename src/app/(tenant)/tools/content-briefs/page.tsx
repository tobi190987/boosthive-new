import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getContentBriefsList } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { ContentBriefsWorkspace } from '@/components/content-briefs-workspace'
import { CustomerSelectorDropdown } from '@/components/customer-selector-dropdown'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { Button } from '@/components/ui/button'
import { ModuleHelpTooltip } from '@/components/module-help-tooltip'
import { MODULE_HELP } from '@/lib/tool-groups'
import { Skeleton } from '@/components/ui/skeleton'

async function ContentBriefsContent({ tenantId }: { tenantId: string }) {
  const initialBriefs = await getContentBriefsList(tenantId)
  return <ContentBriefsWorkspace initialBriefs={initialBriefs} />
}

function ContentBriefsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
    </div>
  )
}

export default async function ContentBriefsPage() {
  const context = await requireTenantShellContext()
  const hasAccess =
    context.activeModuleCodes.includes('content_briefs') || context.activeModuleCodes.includes('all')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="Content Briefs" isAdmin={isAdmin} />
  }

  const help = MODULE_HELP['content_briefs']

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Content Briefs</h1>
            {help && <ModuleHelpTooltip tagline={help.tagline} features={help.features} />}
          </div>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Erstelle strukturierte Briefings mit Keywords, Zielgruppe und Seitenstruktur —
            und gib sie direkt zur Kundenfreigabe frei.
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
            <Link href="/tools/content-briefs?action=create">
              <Plus className="h-4 w-4" />
              Neues Briefing
            </Link>
          </Button>
        </div>
      </div>
      <Suspense fallback={<ContentBriefsSkeleton />}>
        <ContentBriefsContent tenantId={context.tenant.id} />
      </Suspense>
    </>
  )
}
