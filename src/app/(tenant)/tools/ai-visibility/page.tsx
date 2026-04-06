import { Lock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getVisibilityProjectsList } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { AiVisibilityWorkspace } from '@/components/ai-visibility-workspace'

export default async function AiVisibilityPage() {
  const context = await requireTenantShellContext()
  const hasAccess = context.activeModuleCodes.includes('ai_visibility')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return (
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
        <CardContent className="flex flex-col items-center gap-5 px-6 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 dark:bg-[#151c28]">
            <Lock className="h-7 w-7 text-slate-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">AI Visibility ist noch gesperrt</h2>
            <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              Dieses Modul ist für deinen Workspace noch nicht gebucht. Buche es in der Abrechnung, um die KI-Sichtbarkeit in ChatGPT, Perplexity & Co. zu überwachen.
            </p>
          </div>
          {isAdmin ? (
            <Button asChild className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]">
              <a href="/billing">Zur Abrechnung</a>
            </Button>
          ) : (
            <Badge className="rounded-full bg-slate-100 px-4 py-1.5 text-sm text-slate-400 hover:bg-slate-100 dark:bg-[#1e2635] dark:text-slate-300 dark:hover:bg-[#263247]">
              Bitte Admin kontaktieren
            </Badge>
          )}
        </CardContent>
      </Card>
    )
  }

  const initialProjects = await getVisibilityProjectsList(context.tenant.id)

  return (
    <AiVisibilityWorkspace
      role={context.membership.role}
      initialProjects={initialProjects}
    />
  )
}
