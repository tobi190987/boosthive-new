import { Suspense } from 'react'
import { getKeywordProjectsList } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { KeywordProjectsWorkspace } from '@/components/keyword-projects-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { ModuleHelpTooltip } from '@/components/module-help-tooltip'
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
    <>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Keywordranking</h1>
          {help && <ModuleHelpTooltip tagline={help.tagline} features={help.features} />}
        </div>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Tracke Google-Positionen für Keywords deiner Kunden und beobachte,
          wie sich Rankings über Zeit entwickeln.
        </p>
      </div>
      <Suspense fallback={<KeywordsSkeleton />}>
        <KeywordsContent tenantId={context.tenant.id} role={context.membership.role} />
      </Suspense>
    </>
  )
}
