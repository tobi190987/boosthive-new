import { Suspense } from 'react'
import { getKeywordProjectsList } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { KeywordProjectsWorkspace } from '@/components/keyword-projects-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { TenantShellHeader } from '@/components/tenant-shell-header'
import { MODULE_HELP } from '@/lib/tool-groups'
import { Skeleton } from '@/components/ui/skeleton'

async function KeywordsContent({ tenantId, role }: { tenantId: string; role: 'admin' | 'member' }) {
  const initialProjects = await getKeywordProjectsList(tenantId)
  return <KeywordProjectsWorkspace role={role} initialProjects={initialProjects} />
}

function KeywordsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-44 w-full rounded-2xl" />
    </div>
  )
}

export default async function KeywordsPage() {
  const context = await requireTenantShellContext()
  const hasAccess = context.activeModuleCodes.includes('seo_analyse')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="Keywordranking" isAdmin={isAdmin} />
  }

  const help = MODULE_HELP['seo_analyse']

  return (
    <div className="space-y-6">
      <TenantShellHeader
        context={context}
        eyebrow="Analyse & SEO"
        title="Keywordranking"
        description="Tracke Google-Positionen für Keywords deiner Kunden und beobachte, wie sich Rankings über Zeit entwickeln."
        features={help?.features}
      />
      <Suspense fallback={<KeywordsSkeleton />}>
        <KeywordsContent tenantId={context.tenant.id} role={context.membership.role} />
      </Suspense>
    </div>
  )
}
