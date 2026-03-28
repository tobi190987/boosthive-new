import { Lock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getActiveModuleCodes } from '@/lib/module-access'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function AiPerformancePage() {
  const context = await requireTenantShellContext()
  const activeModuleCodes = await getActiveModuleCodes(context.tenant.id)
  const hasAccess = activeModuleCodes.includes('ai_performance')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return (
      <Card className="rounded-[32px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
        <CardContent className="flex flex-col items-center gap-5 px-6 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-[#f7f3ed]">
            <Lock className="h-7 w-7 text-[#a35a34]" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-950">AI Performance ist noch gesperrt</h2>
            <p className="max-w-2xl text-sm leading-7 text-slate-600">
              Dieses Modul ist für deinen Workspace noch nicht gebucht. Buche es in der Abrechnung, um die KI-gestützte Performance-Analyse zu nutzen.
            </p>
          </div>
          {isAdmin ? (
            <Button asChild className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]">
              <a href="/billing">Zur Abrechnung</a>
            </Button>
          ) : (
            <Badge className="rounded-full bg-[#fff1e8] px-4 py-1.5 text-sm text-[#a35a34] hover:bg-[#fff1e8]">
              Bitte Admin kontaktieren
            </Badge>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-[32px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
      <CardContent className="px-6 py-12 text-center text-slate-500">
        AI Performance Analyse — in Entwicklung.
      </CardContent>
    </Card>
  )
}
