import type { ComponentType } from 'react'
import {
  BarChart3,
  Bot,
  CalendarDays,
  CheckSquare,
  Eye,
  FileImage,
  FileText,
  LayoutGrid,
  Megaphone,
  Search,
  TrendingUp,
} from 'lucide-react'

export type ColorKey = 'blue' | 'indigo' | 'violet' | 'purple' | 'emerald' | 'orange' | 'amber' | 'rose' | 'teal'

export interface ToolItem {
  label: string
  description: string
  href: string
  icon: ComponentType<{ className?: string }>
  moduleCode: string
  color: ColorKey
  /** Nicht in der Sidebar-Navigation anzeigen (default: true) */
  showInNav?: boolean
  /** Nicht im Tools-Grid anzeigen (default: true) */
  showInGrid?: boolean
}

export const TOOL_GROUPS: { label: string; items: ToolItem[] }[] = [
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
      {
        label: 'Brand Trends',
        description: 'Beobachte Google-Trends-Verläufe und verwandte Suchanfragen für deine Kunden-Marken.',
        href: '/tools/brand-trends',
        icon: TrendingUp,
        moduleCode: 'brand_intelligence',
        color: 'teal',
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
        // ARCHIVED: aus Navigation + Tools-Grid ausgeblendet (April 2026) — Route /tools/kanban bleibt erhalten
        showInNav: false,
        showInGrid: false,
      },
      {
        label: 'Social Media Kalender',
        description: 'Plane und verwalte Social-Media-Posts für Instagram, LinkedIn, Facebook und TikTok.',
        href: '/tools/social-calendar',
        icon: CalendarDays,
        moduleCode: 'social_calendar',
        color: 'rose',
        // ARCHIVED: aus Navigation + Tools-Grid ausgeblendet (April 2026) — Route /tools/social-calendar bleibt erhalten
        showInNav: false,
        showInGrid: false,
      },
      {
        label: 'Freigaben',
        description: 'Verfolge Freigaben, Korrekturen und Abnahmen im Überblick.',
        href: '/tools/approvals',
        icon: CheckSquare,
        moduleCode: 'approvals',
        color: 'blue',
        showInNav: false,
      },
    ],
  },
]

export const MODULE_HELP: Record<string, { tagline: string; features: string[] }> = {
  seo_analyse: {
    tagline: 'Vollständige SEO-Analyse und Keyword-Tracking für deine Kunden-Websites.',
    features: [
      'On-Page SEO-Analyse (Metadaten, Überschriften, interne Links)',
      'Google Search Console Integration',
      'Keyword-Positionen tracken und Rankingverläufe analysieren',
      'Technische SEO-Fehler erkennen',
    ],
  },
  ai_performance: {
    tagline: 'KI-gestützte Content- und Kampagnen-Optimierung.',
    features: [
      'Performance-Analyse deiner Inhalte und Anzeigen',
      'KI-Verbesserungsvorschläge für Texte und Creatives',
      'Vergleich gegen Branchen-Benchmarks',
    ],
  },
  ai_visibility: {
    tagline: 'Wie präsent ist deine Marke in KI-Antworten wie ChatGPT oder Gemini?',
    features: [
      'Sichtbarkeits-Score in LLM-Suchantworten (ChatGPT, Gemini, Perplexity)',
      'Benchmark gegen Wettbewerber',
      'GEO-Optimierungsempfehlungen (Generative Engine Optimization)',
      'Analyse-Historie und Trendverläufe',
    ],
  },
  brand_intelligence: {
    tagline: 'Google-Trends-Daten, Web-Mentions und Sentiment für deine Kundenmarken.',
    features: [
      'Google Trends Verlauf (bis 5 Jahre)',
      'Web-Mentions Monitoring (News & Blogs)',
      'Sentiment-Analyse der Erwähnungen',
      'Social Media Trend Radar',
    ],
  },
  content_briefs: {
    tagline: 'Strukturierte Content-Briefings für SEO-optimierte Texte.',
    features: [
      'KI-generierte Briefing-Strukturen',
      'SEO-Keyword-Integration',
      'Freigabe-Workflow mit Kunden',
      'Status-Tracking (Entwurf → Freigegeben)',
    ],
  },
  ad_generator: {
    tagline: 'KI-Anzeigentexte generieren und Werbemittel zentral verwalten.',
    features: [
      'Anzeigentexte für Google, Meta, LinkedIn und TikTok',
      'Ads-Bibliothek für genehmigte Werbemittel',
      'Varianten-Generierung (A/B-Testing-ready)',
      'Kunden-Freigabe direkt in der App',
    ],
  },
}

export const COLOR_MAP: Record<ColorKey, { icon: string; bg: string }> = {
  blue: { icon: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40' },
  indigo: { icon: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
  violet: { icon: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/40' },
  purple: { icon: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/40' },
  emerald: { icon: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  orange: { icon: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/40' },
  amber: { icon: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  rose: { icon: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/40' },
  teal: { icon: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/40' },
}
