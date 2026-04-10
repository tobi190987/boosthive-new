import { requireTenantShellContext } from '@/lib/tenant-shell'
import { ToolsGrid } from './tools-grid'

export default async function ToolsPage() {
  const context = await requireTenantShellContext()

  return (
    <div className="space-y-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Alle Tools</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Wähle ein Tool, um loszulegen. Gesperrte Module lassen sich unter Abrechnung aktivieren.
        </p>
      </div>

      <ToolsGrid activeCodes={context.activeModuleCodes} />
    </div>
  )
}
