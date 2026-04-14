import { getVisibilityProjectsList } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { AiVisibilityWorkspace } from '@/components/ai-visibility-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { QuotaBadge } from '@/components/quota-badge'
import { ModuleHelpTooltip } from '@/components/module-help-tooltip'
import { MODULE_HELP } from '@/lib/tool-groups'

export default async function AiVisibilityPage() {
  const context = await requireTenantShellContext()
  const hasAccess = context.activeModuleCodes.includes('ai_visibility')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="AI Visibility" isAdmin={isAdmin} />
  }

  const initialProjects = await getVisibilityProjectsList(context.tenant.id)
  const help = MODULE_HELP['ai_visibility']

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">AI Visibility</h1>
          <QuotaBadge metric="ai_visibility_analyses" label="Analysen" />
          {help && <ModuleHelpTooltip tagline={help.tagline} features={help.features} />}
        </div>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Analysiere deine Sichtbarkeit in KI-Suchantworten und LLMs.
        </p>
      </div>
      <AiVisibilityWorkspace
        role={context.membership.role}
        initialProjects={initialProjects}
      />
    </>
  )
}
