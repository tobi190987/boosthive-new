import { Suspense } from 'react'
import { getVisibilityProjectsList } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { AiVisibilityWorkspace } from '@/components/ai-visibility-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { QuotaBadge } from '@/components/quota-badge'
import { TenantShellHeader } from '@/components/tenant-shell-header'
import { MODULE_HELP } from '@/lib/tool-groups'
import { Skeleton } from '@/components/ui/skeleton'

async function AiVisibilityContent({ tenantId, role }: { tenantId: string; role: 'admin' | 'member' }) {
  const initialProjects = await getVisibilityProjectsList(tenantId)
  return <AiVisibilityWorkspace role={role} initialProjects={initialProjects} />
}

function AiVisibilitySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-44 w-full rounded-2xl" />
    </div>
  )
}

export default async function AiVisibilityPage() {
  const context = await requireTenantShellContext()
  const hasAccess = context.activeModuleCodes.includes('ai_visibility')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="AI Visibility" isAdmin={isAdmin} />
  }

  const help = MODULE_HELP['ai_visibility']

  return (
    <div className="space-y-6">
      <TenantShellHeader
        context={context}
        eyebrow="Analyse & SEO"
        title="AI Visibility"
        description="Miss, wie oft deine Kundenmarken in KI-Antworten (ChatGPT, Gemini, Perplexity) erscheinen — und vergleiche dich mit Wettbewerbern."
        features={help?.features}
        badge={<QuotaBadge metric="ai_visibility_analyses" label="Analysen" />}
      />
      <Suspense fallback={<AiVisibilitySkeleton />}>
        <AiVisibilityContent tenantId={context.tenant.id} role={context.membership.role} />
      </Suspense>
    </div>
  )
}
