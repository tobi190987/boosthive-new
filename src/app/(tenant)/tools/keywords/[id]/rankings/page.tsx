import { ChevronRight, Lock } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getKeywordProjectDetail, getKeywordProjectGscStatus } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { KeywordProjectsWorkspace } from '@/components/keyword-projects-workspace'

export default async function KeywordRankingsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const context = await requireTenantShellContext()
  const hasAccess = context.activeModuleCodes.includes('seo_analyse')
  const isAdmin = context.membership.role === 'admin'
  const { id } = await params

  if (!hasAccess) {
    return (
      <Card className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
        <CardContent className="flex flex-col items-center gap-5 px-6 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 dark:bg-card">
            <Lock className="h-7 w-7 text-slate-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Keywordranking ist noch gesperrt</h2>
            <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              Dieser Bereich gehört zum Modul SEO-Analyse. Buche SEO-Analyse in der Abrechnung, um Keyword-Projekte anzulegen und Rankings zu tracken.
            </p>
          </div>
          {isAdmin ? (
            <Button asChild variant="dark">
              <a href="/billing">Zur Abrechnung</a>
            </Button>
          ) : (
            <Badge className="rounded-full bg-slate-100 px-4 py-1.5 text-sm text-slate-400 hover:bg-slate-100 dark:bg-secondary dark:text-slate-300 dark:hover:bg-[#263247]">
              Bitte Admin kontaktieren
            </Badge>
          )}
        </CardContent>
      </Card>
    )
  }

  const [initialProject, initialGscStatus] = await Promise.all([
    getKeywordProjectDetail(context.tenant.id, id),
    getKeywordProjectGscStatus(context.tenant.id, id),
  ])

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/tools" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
          Tools
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <Link href="/tools/keywords" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
          Keywords
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="text-slate-900 dark:text-slate-100 font-medium">
          {initialProject?.name ?? 'Projekt'}
        </span>
      </nav>
      <KeywordProjectsWorkspace
        role={context.membership.role}
        initialProjectId={id}
        initialTab="rankings"
        initialProject={initialProject}
        initialGscStatus={initialGscStatus}
      />
    </div>
  )
}
