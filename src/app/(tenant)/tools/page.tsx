import { requireTenantShellContext } from '@/lib/tenant-shell'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckSquare,
  Eye,
  FileImage,
  FileText,
  LayoutGrid,
  Lock,
  Megaphone,
  Search,
} from 'lucide-react'
type ColorKey = 'blue' | 'indigo' | 'violet' | 'purple' | 'emerald' | 'orange' | 'amber'

interface ToolCard {
  label: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  moduleCode: string
  color: ColorKey
}

const TOOL_GROUPS: { label: string; items: ToolCard[] }[] = [
  {
    label: 'Analyse & SEO',
    items: [
      {
        label: 'SEO Analyse',
        description: 'Analysiere On-Page SEO, Metadaten und technische Optimierungen.',
        href: '/tools/seo-analyse',
        icon: BarChart3,
        moduleCode: 'seo_analyse',
        color: 'blue',
      },
      {
        label: 'Keywordranking',
        description: 'Tracke Keyword-Positionen und analysiere Rankingverläufe.',
        href: '/tools/keywords',
        icon: Search,
        moduleCode: 'seo_analyse',
        color: 'indigo',
      },
      {
        label: 'AI Performance',
        description: 'Optimiere Inhalte und Kampagnen mit KI-gestützten Analysen.',
        href: '/tools/ai-performance',
        icon: Bot,
        moduleCode: 'ai_performance',
        color: 'violet',
      },
      {
        label: 'AI Visibility',
        description: 'Analysiere deine Sichtbarkeit in KI-Suchantworten und LLMs.',
        href: '/tools/ai-visibility',
        icon: Eye,
        moduleCode: 'ai_visibility',
        color: 'purple',
      },
    ],
  },
  {
    label: 'Content & Kampagnen',
    items: [
      {
        label: 'Content Briefs',
        description: 'Erstelle strukturierte Inhaltsanweisungen für SEO-optimierten Content.',
        href: '/tools/content-briefs',
        icon: FileText,
        moduleCode: 'content_briefs',
        color: 'emerald',
      },
      {
        label: 'Ad Generator',
        description: 'Generiere KI-Anzeigentexte für Facebook, Google, LinkedIn und TikTok.',
        href: '/tools/ad-generator',
        icon: Megaphone,
        moduleCode: 'ad_generator',
        color: 'orange',
      },
      {
        label: 'Ads Bibliothek',
        description: 'Verwalte und organisiere genehmigte Werbemittel für deine Kunden.',
        href: '/tools/ads-library',
        icon: FileImage,
        moduleCode: 'ad_generator',
        color: 'amber',
      },
      {
        label: 'Kanban Board',
        description: 'Steuere Content Briefs, Ads und Creatives in einem gemeinsamen Status-Board.',
        href: '/tools/kanban',
        icon: LayoutGrid,
        moduleCode: 'kanban',
        color: 'blue',
      },
      {
        label: 'Freigaben',
        description: 'Verfolge Freigaben, Korrekturen und Abnahmen im Überblick.',
        href: '/tools/approvals',
        icon: CheckSquare,
        moduleCode: 'approvals',
        color: 'blue',
      },
    ],
  },
]

const COLOR_MAP: Record<ColorKey, { icon: string; bg: string }> = {
  blue: { icon: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40' },
  indigo: { icon: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
  violet: { icon: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/40' },
  purple: { icon: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/40' },
  emerald: { icon: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  orange: { icon: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/40' },
  amber: { icon: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
}

export default async function ToolsPage() {
  const context = await requireTenantShellContext()
  const activeCodes = context.activeModuleCodes

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Alle Tools</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Wähle ein Tool, um loszulegen. Gesperrte Module lassen sich unter Abrechnung aktivieren.
        </p>
      </div>

      {TOOL_GROUPS.map((group) => (
        <div key={group.label}>
          <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
            {group.label}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((tool) => {
              const hasAccess =
                activeCodes.includes('all') ||
                activeCodes.includes(tool.moduleCode) ||
                ((tool.moduleCode === 'kanban' || tool.moduleCode === 'approvals') &&
                  (activeCodes.includes('content_briefs') || activeCodes.includes('ad_generator')))
              const colors = COLOR_MAP[tool.color]
              const Icon = tool.icon

              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className={`group relative flex flex-col gap-4 rounded-2xl border p-5 transition-all ${
                    hasAccess
                      ? 'border-slate-100 bg-white shadow-soft hover:border-slate-200 hover:shadow-md dark:border-border dark:bg-card dark:hover:border-[#3d4a5c]'
                      : 'pointer-events-none border-dashed border-slate-200 bg-slate-50/50 dark:border-border/60 dark:bg-card/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        hasAccess ? colors.bg : 'bg-slate-100 dark:bg-slate-800/60'
                      }`}
                    >
                      {hasAccess ? (
                        <Icon className={`h-5 w-5 ${colors.icon}`} />
                      ) : (
                        <Lock className="h-5 w-5 text-slate-400 dark:text-slate-600" />
                      )}
                    </div>
                    {!hasAccess ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-600"
                      >
                        Gesperrt
                      </Badge>
                    ) : (
                      <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
                    )}
                  </div>
                  <div>
                    <p
                      className={`font-semibold ${
                        hasAccess ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-600'
                      }`}
                    >
                      {tool.label}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                      {tool.description}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
