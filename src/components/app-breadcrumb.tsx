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
  // settings sub-pages
  profile: 'Profil',
  team: 'Team',
  legal: 'Rechtliches',
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
  )
}
