'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { useActiveCustomer } from '@/lib/active-customer-context'

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  tools: 'Tools',
  settings: 'Einstellungen',
  billing: 'Abrechnung',
  notifications: 'Benachrichtigungen',
  help: 'Hilfe',
  // tools sub-pages
  'seo-analyse': 'SEO Analyse',
  keywords: 'Keywordranking',
  'ai-performance': 'AI Performance',
  'ai-visibility': 'AI Visibility',
  'content-briefs': 'Content Briefs',
  'ad-generator': 'Ad Generator',
  'ads-library': 'Ads Bibliothek',
  kanban: 'Content Workflow',
  approvals: 'Freigaben',
  customers: 'Kunden',
  'seo-compare': 'Competitor Analyse',
  'gsc-rankings': 'GSC Rankings',
  rankings: 'Rankings',
  // top-level pages
  budget: 'Budget Tracking',
  exports: 'Export Center',
  portfolio: 'Portfolio',
  // tools sub-pages (additional)
  'brand-trends': 'Brand Intelligence',
  'social-calendar': 'Social Media Kalender',
  // settings sub-pages
  profile: 'Profil',
  team: 'Team',
  legal: 'Rechtliches',
  portal: 'Client-Portal',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(segment: string): boolean {
  return UUID_REGEX.test(segment)
}

function segmentToLabel(segment: string): string {
  return SEGMENT_LABELS[segment] ?? segment
}

export function AppBreadcrumb() {
  const pathname = usePathname()
  const { activeCustomer } = useActiveCustomer()

  // Split path and filter empty segments
  const segments = pathname.split('/').filter(Boolean)

  // Don't show breadcrumb for top-level pages (only 1 segment)
  if (segments.length <= 1) return null

  // Build breadcrumb items: each item has href and label
  // UUID segments are skipped (dynamic route params like /keywords/[id]/rankings)
  const items: { label: string; href: string }[] = []

  let cumulative = ''
  for (const segment of segments) {
    cumulative += `/${segment}`
    if (isUuid(segment)) continue
    items.push({ label: segmentToLabel(segment), href: cumulative })
  }

  if (items.length === 0) return null

  return (
    <div className="flex items-center gap-3 min-w-0">
      <Breadcrumb>
        <BreadcrumbList>
          {items.map((item, index) => {
            const isLast = index === items.length - 1
            return (
              <span key={item.href} className="flex items-center gap-1.5">
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </span>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {activeCustomer && (
        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400 shrink-0">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {activeCustomer.name}
        </span>
      )}
    </div>
  )
}
