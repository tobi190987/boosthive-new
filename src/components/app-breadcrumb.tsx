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
  verwaltung: 'Verwaltung',
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

// Paths that belong to "Verwaltung" but live under other URL prefixes
// Maps a path prefix to breadcrumb items that should appear before the final segment
const VERWALTUNG_PATHS: Record<string, string> = {
  '/tools/customers': 'Kunden',
  '/settings/team': 'Team',
  '/settings/legal': 'Rechtliches',
  '/billing': 'Abrechnung',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(segment: string): boolean {
  return UUID_REGEX.test(segment)
}

function segmentToLabel(segment: string): string {
  return SEGMENT_LABELS[segment] ?? segment
}

function getVerwaltungOverride(pathname: string): { label: string; href: string }[] | null {
  for (const [prefix, label] of Object.entries(VERWALTUNG_PATHS)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      const items: { label: string; href: string }[] = [
        { label: 'Verwaltung', href: '/verwaltung' },
        { label, href: prefix },
      ]
      // Append any deeper segments (e.g. sub-pages)
      if (pathname !== prefix) {
        const rest = pathname.slice(prefix.length).split('/').filter(Boolean)
        let cumulative = prefix
        for (const seg of rest) {
          cumulative += `/${seg}`
          if (!isUuid(seg)) {
            items.push({ label: segmentToLabel(seg), href: cumulative })
          }
        }
      }
      return items
    }
  }
  return null
}

export function AppBreadcrumb() {
  const pathname = usePathname()

  // Split path and filter empty segments
  const segments = pathname.split('/').filter(Boolean)

  // Check if this path belongs to Verwaltung (custom override)
  // Must happen BEFORE the segments.length guard (e.g. /billing is single-segment but needs Verwaltung > Abrechnung)
  const override = getVerwaltungOverride(pathname)

  // Don't show breadcrumb for top-level pages (only 1 segment) — unless there's a custom override
  if (segments.length <= 1 && !override) return null

  // Build breadcrumb items: each item has href and label
  // UUID segments are skipped (dynamic route params like /keywords/[id]/rankings)
  const items: { label: string; href: string }[] = override ?? []

  if (!override) {
    let cumulative = ''
    for (const segment of segments) {
      cumulative += `/${segment}`
      if (isUuid(segment)) continue
      items.push({ label: segmentToLabel(segment), href: cumulative })
    }
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
