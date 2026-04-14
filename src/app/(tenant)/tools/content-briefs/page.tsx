import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getContentBriefsList } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { ContentBriefsWorkspace } from '@/components/content-briefs-workspace'
import { CustomerSelectorDropdown } from '@/components/customer-selector-dropdown'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { Button } from '@/components/ui/button'
import { TenantShellHeader } from '@/components/tenant-shell-header'
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
    <div className="space-y-6">
      <TenantShellHeader
        context={context}
        eyebrow="Content & Kampagnen"
        title="Content Briefs"
        description="Erstelle strukturierte Briefings mit Keywords, Zielgruppe und Seitenstruktur — und gib sie direkt zur Kundenfreigabe frei."
        features={help?.features}
        actions={
          <>
            <div className="w-full sm:w-[280px]">
              <CustomerSelectorDropdown
                className="mx-0 my-0 w-full"
                triggerClassName="mx-0 my-0 w-full"
                compact
              />
            </div>
            <Button asChild variant="dark" className="gap-2 shrink-0">
              <Link href="/tools/content-briefs?action=create">
                <Plus className="h-4 w-4" />
                Neues Briefing
              </Link>
            </Button>
          </>
        }
      />
      <Suspense fallback={<ContentBriefsSkeleton />}>
        <ContentBriefsContent tenantId={context.tenant.id} />
      </Suspense>
    </div>
  )
}
