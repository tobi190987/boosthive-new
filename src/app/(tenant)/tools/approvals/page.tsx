import { Lock } from 'lucide-react'
import { ApprovalsWorkspace } from '@/components/approvals-workspace'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function ApprovalsPage() {
  const context = await requireTenantShellContext()
  const hasAccess =
    context.activeModuleCodes.includes('content_briefs') ||
    context.activeModuleCodes.includes('ad_generator') ||
    context.activeModuleCodes.includes('all')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return (
      <Card className="rounded-[2rem] border border-slate-100 bg-white shadow-soft dark:border-[#252d3a] dark:bg-[#151c28]">
        <CardContent className="flex flex-col items-center gap-5 px-6 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 dark:bg-[#151c28]">
            <Lock className="h-7 w-7 text-slate-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">
              Freigaben sind noch gesperrt
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              Das Freigabe-Cockpit wird ueber Content Briefs und den Ad Generator gespeist. Buche
              mindestens eines dieser Module, um Freigaben, Feedback und Status zentral zu steuern.
            </p>
          </div>
          {isAdmin ? (
            <Button asChild className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]">
              <a href="/billing">Zur Abrechnung</a>
            </Button>
          ) : (
            <Badge className="rounded-full bg-slate-100 px-4 py-1.5 text-sm text-slate-400 hover:bg-slate-100 dark:bg-[#1e2635]">
              Bitte Admin kontaktieren
            </Badge>
          )}
        </CardContent>
      </Card>
    )
  }

  return <ApprovalsWorkspace />
}
