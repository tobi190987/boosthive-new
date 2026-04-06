import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  Blocks,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  FileStack,
  Globe2,
  KeyRound,
  LayoutGrid,
  LineChart,
  LucideIcon,
  Megaphone,
  Search,
  ShieldCheck,
  Sparkles,
  Users2,
  Workflow,
} from 'lucide-react'
import { PreviewAccessForm } from '@/components/preview-access-form'
import { formatPrice, type MarketingPriceItem, type MarketingTenantBranding } from '@/lib/marketing'

type PageMode = 'home' | 'access'

interface MarketingPagesProps {
  mode: PageMode
  pricing?: MarketingPriceItem[]
  tenant: MarketingTenantBranding | null
  returnTo?: string
}

interface FeatureItem {
  icon: LucideIcon
  title: string
  copy: string
}

interface FeatureGroup {
  title: string
  intro: string
  items: FeatureItem[]
}

const rootAccessFeatures: FeatureItem[] = [
  {
    icon: Globe2,
    title: 'White-Label Zugänge pro Agentur',
    copy: 'Jede Agentur arbeitet auf ihrer eigenen Subdomain mit eigenem Branding und sauber getrennten Daten.',
  },
  {
    icon: Search,
    title: 'SEO, Rankings und KI-Sichtbarkeit',
    copy: 'Von SEO-Analysen über GSC-Rankings bis zu AI Visibility Reports liegt alles in einer Plattform.',
  },
  {
    icon: Workflow,
    title: 'Briefings, Ads und Freigaben',
    copy: 'Content Briefs, Ad Text Generator und Client Approval Hub verbinden Strategie, Produktion und Abnahme.',
  },
  {
    icon: ShieldCheck,
    title: 'Team, Rollen und Billing',
    copy: 'Rollenmodell, Einladungen, Modul-Buchung und sicherer Workspace-Zugang sind bereits integriert.',
  },
]

const tenantAccessFeatures: FeatureItem[] = [
  {
    icon: BriefcaseBusiness,
    title: 'Eigener Agentur-Workspace',
    copy: 'Dein Team arbeitet in einer separaten Umgebung mit eurem Branding, eurem Login und eurem Datenraum.',
  },
  {
    icon: LineChart,
    title: 'Operative Marketing-Tools',
    copy: 'SEO, Rankings, AI Visibility, Performance-Analysen und weitere Module laufen in einem gemeinsamen System.',
  },
  {
    icon: FileStack,
    title: 'Kundenarbeit an einem Ort',
    copy: 'Kundendatenbank, Dokumente, Content Briefs und Freigaben sind direkt an euren Tenant gebunden.',
  },
  {
    icon: Users2,
    title: 'Schneller Einstieg für Teams',
    copy: 'Admins laden Kolleginnen und Kollegen ein und steuern Rechte, Module und Zugriffe zentral im Workspace.',
  },
]

const rootFeatureGroups: FeatureGroup[] = [
  {
    title: 'Plattform und White-Label',
    intro: 'Der Kern von BoostHive ist eine gebrandete Agenturplattform statt eines losen Tool-Stapels.',
    items: [
      {
        icon: Globe2,
        title: 'Tenant-Subdomains mit Branding',
        copy: 'Jede Agentur bekommt eine eigene Subdomain, ein eigenes Logo und eine isolierte Arbeitsumgebung.',
      },
      {
        icon: KeyRound,
        title: 'Sichere Auth- und Recovery-Flows',
        copy: 'Login, Passwort-Reset und Zugriffsschutz folgen tenant-spezifisch demselben klaren Flow.',
      },
      {
        icon: Users2,
        title: 'Rollen, Team-Einladungen und Admin-Steuerung',
        copy: 'Admins verwalten Mitglieder, Rollen und Zugriffe direkt im Tenant.',
      },
      {
        icon: Blocks,
        title: 'Modulare Buchung statt Tool-Wildwuchs',
        copy: 'Basis-Plan und zubuchbare Module halten Setup und Monetarisierung sauber strukturiert.',
      },
    ],
  },
  {
    title: 'SEO, Search und Visibility',
    intro: 'BoostHive deckt klassische SEO-Arbeit genauso ab wie Sichtbarkeit in KI-getriebenen Suchumgebungen.',
    items: [
      {
        icon: Search,
        title: 'SEO Analyse und Competitor Analyse',
        copy: 'Website-Audits und Wettbewerbsvergleiche liefern schnelle Handlungsempfehlungen für Optimierungen.',
      },
      {
        icon: BarChart3,
        title: 'Keyword Projekte und Ranking-Historie',
        copy: 'Keywords, Wettbewerber, Verlauf und Monitoring bleiben pro Kunde strukturiert abrufbar.',
      },
      {
        icon: Globe2,
        title: 'Google Search Console Integration',
        copy: 'GSC-Property-Verknüpfung, Discovery Views und Ranking-Daten laufen direkt im Workspace zusammen.',
      },
      {
        icon: Bot,
        title: 'AI Visibility Analytics und Reports',
        copy: 'Sichtbarkeit in ChatGPT, Perplexity und Co. wird messbar, nachvollziehbar und reportbar.',
      },
    ],
  },
  {
    title: 'Produktion, Kampagnen und Kundenarbeit',
    intro: 'Nicht nur Analyse, sondern auch operative Umsetzung und Kundenfreigaben sind bereits im Produkt angelegt.',
    items: [
      {
        icon: Sparkles,
        title: 'Content Brief Generator',
        copy: 'Briefings für SEO-orientierte Inhalte entstehen schneller und konsistenter.',
      },
      {
        icon: Megaphone,
        title: 'Ad Text Generator',
        copy: 'Anzeigentexte für Social und Paid Kampagnen werden kanalnah vorbereitet.',
      },
      {
        icon: Workflow,
        title: 'Client Approval Hub',
        copy: 'Freigaben, Feedback und finale Entscheidungen passieren über einen nachvollziehbaren Workflow.',
      },
      {
        icon: FileStack,
        title: 'Customer Database und Dokumentenablage',
        copy: 'Kundenprofile, Dokumente und operative Informationen bleiben an einem Ort zusammen.',
      },
    ],
  },
]

const tenantFeatureGroups: FeatureGroup[] = [
  {
    title: 'Was dein Team hier bekommt',
    intro: 'Der Tenant ist nicht nur ein Login, sondern eure gebrandete Schaltzentrale für operative Marketingarbeit.',
    items: [
      {
        icon: LayoutGrid,
        title: 'Gemeinsames Dashboard',
        copy: 'Alle gebuchten Module, Team-Kontexte und Kundenflüsse starten aus einer Shell.',
      },
      {
        icon: ShieldCheck,
        title: 'Saubere Rollen- und Rechtevergabe',
        copy: 'Admins steuern Mitglieder, Billing und Modulzugriffe, während Members fokussiert arbeiten können.',
      },
      {
        icon: FileStack,
        title: 'Kundenverwaltung mit Dokumenten',
        copy: 'Kundendaten, Unterlagen und Arbeitskontexte bleiben direkt an eure Agentur gebunden.',
      },
      {
        icon: Workflow,
        title: 'Freigaben ohne Medienbruch',
        copy: 'Interne Produktion und Kundenabnahme bleiben im selben Workspace nachvollziehbar.',
      },
    ],
  },
  {
    title: 'Module für Analyse und Wachstum',
    intro: 'BoostHive verbindet SEO, Search, KI-Sichtbarkeit und Content-Produktion in einer Agenturumgebung.',
    items: [
      {
        icon: Search,
        title: 'SEO Analyse und Wettbewerbsvergleiche',
        copy: 'Technische, inhaltliche und competitor-basierte Analysen helfen bei Priorisierung und Beratung.',
      },
      {
        icon: BarChart3,
        title: 'Keyword Monitoring und GSC',
        copy: 'Keyword-Projekte, historische Rankings und Search-Console-Daten werden zusammengeführt.',
      },
      {
        icon: Bot,
        title: 'AI Visibility und Performance',
        copy: 'KI-getriebene Sichtbarkeit und Marketing-Performance werden nicht nur beobachtet, sondern auswertbar gemacht.',
      },
      {
        icon: Sparkles,
        title: 'Content Briefs und Ad Creation',
        copy: 'Briefings und Kampagnenentwürfe entstehen dort, wo auch Analyse und Kundenfeedback liegen.',
      },
    ],
  },
]

function FeatureCard({ icon: Icon, title, copy }: FeatureItem) {
  return (
    <div className="rounded-[1.75rem] border border-white/60 bg-white/75 p-5 shadow-[0_20px_60px_-42px_rgba(15,23,42,0.35)] backdrop-blur dark:border-[#252d3a] dark:bg-[#111827]/80">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0f766e]/10 text-[#0f766e]">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{copy}</p>
    </div>
  )
}

function Header({ tenant, mode }: { tenant: MarketingTenantBranding | null; mode: PageMode }) {
  const isTenant = Boolean(tenant)

  return (
    <header className="flex flex-col gap-5 py-6 sm:flex-row sm:items-center sm:justify-between">
      <Link href="/" className="flex items-center gap-3">
        {tenant?.logoUrl ? (
          <Image
            src={tenant.logoUrl}
            alt={`${tenant.name} Logo`}
            width={220}
            height={72}
            priority
            unoptimized
            className="h-10 w-auto max-w-[220px] object-contain"
          />
        ) : (
          <Image
            src="/boosthive_light.png"
            alt="BoostHive"
            width={759}
            height={213}
            priority
            className="h-10 w-auto object-contain"
          />
        )}
        <div className="hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
          {isTenant ? `${tenant?.slug}.boost-hive.de` : 'boost-hive.de'}
        </div>
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        {mode === 'home' && (
          <Link
            href="/access"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-[#252d3a] dark:bg-[#111827] dark:text-slate-300 dark:hover:border-slate-600"
          >
            Vorschau-Zugang
          </Link>
        )}
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-[#252d3a] dark:bg-[#111827] dark:text-slate-300 dark:hover:border-slate-600"
        >
          {isTenant ? 'Tenant Login' : 'Agentur Login'}
        </Link>
        {!isTenant && (
          <Link
            href="/owner/login"
            className="inline-flex items-center justify-center rounded-full bg-[#0f172a] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#111f35]"
          >
            Owner Login
          </Link>
        )}
      </div>
    </header>
  )
}

function Hero({
  tenant,
  mode,
}: {
  tenant: MarketingTenantBranding | null
  mode: PageMode
}) {
  const isTenant = Boolean(tenant)

  const eyebrow = isTenant
    ? 'Gebrandeter Agentur-Tenant'
    : mode === 'access'
      ? 'Geschützte Vorschau'
      : 'White-Label Marketing OS'

  const title =
    mode === 'access'
      ? isTenant
        ? `${tenant?.name ?? tenant?.slug} ist aktuell per Projektschutz erreichbar.`
        : 'BoostHive ist aktuell nur für freigegebene Personen sichtbar.'
      : isTenant
        ? `${tenant?.name ?? tenant?.slug} arbeitet auf einem eigenen BoostHive-Workspace.`
        : 'BoostHive bringt White-Label Workspace, Marketing-Tools und Kundenprozesse in eine Plattform.'

  const description =
    mode === 'access'
      ? isTenant
        ? 'Nach der Freigabe landest du direkt im gebrandeten Agentur-Tenant mit Team-, Tool- und Kundenkontext.'
        : 'Die Root-Domain und alle Tenant-Subdomains sind temporär geschützt, während Inhalte und Agentur-Workspaces abgestimmt werden.'
      : isTenant
        ? 'Dieser Tenant zeigt, wie eine Agentur in BoostHive SEO, Visibility, Content, Kampagnen und Freigaben in einer eigenen Markenwelt abbildet.'
        : 'Von der Tenant-Provisionierung über Billing und Rollen bis zu SEO, AI Visibility, Content Briefs und Kundenfreigaben ist der komplette Agentur-Flow vorbereitet.'

  const bullets = isTenant
    ? ['Eigenes Branding', 'Separater Datenraum', 'Team- und Kundenkontext']
    : ['Multi-Tenant Plattform', 'Module pro Agentur', 'Owner- und Tenant-Ebene']

  return (
    <section className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
      <div className="space-y-6">
        <span className="inline-flex items-center rounded-full border border-[#99f6e4] bg-[#ccfbf1] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#115e59] dark:border-teal-900/70 dark:bg-teal-950/40 dark:text-teal-200">
          {eyebrow}
        </span>
        <div className="space-y-4">
          <h1 className="max-w-4xl text-4xl font-semibold leading-tight tracking-tight text-slate-950 dark:text-slate-50 sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">{description}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={mode === 'access' ? '#access-form' : '/login'}
            className="inline-flex items-center gap-2 rounded-full bg-[#0f766e] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-24px_rgba(15,118,110,0.6)] transition hover:bg-[#0b5f58]"
          >
            {mode === 'access' ? 'Passwort eingeben' : isTenant ? 'In den Tenant einloggen' : 'Plattform ansehen'}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={mode === 'access' ? '/' : '/access'}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-[#252d3a] dark:bg-[#111827] dark:text-slate-300 dark:hover:border-slate-600"
          >
            {mode === 'access' ? 'Zur Startseite' : 'Vorschau-Zugang'}
          </Link>
        </div>
        <div className="flex flex-wrap gap-3 pt-2">
          {bullets.map((bullet) => (
            <span
              key={bullet}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-sm text-slate-600 dark:border-[#252d3a] dark:bg-[#111827]/80 dark:text-slate-300"
            >
              <CheckCircle2 className="h-4 w-4 text-[#0f766e]" />
              {bullet}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-[2rem] border border-[#0f172a]/10 bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.18),_rgba(255,255,255,0.96)_45%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,253,250,0.96))] p-6 shadow-[0_30px_100px_-52px_rgba(15,23,42,0.5)] dark:border-[#1f2937] dark:bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.18),_rgba(15,23,42,0.96)_45%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] sm:p-8">
        <div className="rounded-[1.75rem] border border-white/80 bg-white/80 p-6 backdrop-blur dark:border-[#252d3a] dark:bg-[#0f172a]/80">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">
            {isTenant ? 'Tenant Snapshot' : 'Platform Snapshot'}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.5rem] bg-slate-950 px-5 py-4 text-white">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Workspace</p>
              <p className="mt-3 text-xl font-semibold">
                {isTenant ? tenant?.name ?? tenant?.slug : 'BoostHive'}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {isTenant
                  ? 'Gebrandeter Agenturzugang mit eigener Domain und isoliertem Teamraum.'
                  : 'Plattform für mehrere Agenturen mit klar getrennter Tenant-Struktur.'}
              </p>
            </div>
            <div className="rounded-[1.5rem] bg-[#ecfeff] px-5 py-4 text-slate-900 dark:bg-cyan-950/40 dark:text-slate-100">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">Scope</p>
              <p className="mt-3 text-xl font-semibold">
                {mode === 'access' ? 'Preview + Access' : 'Features + Pricing'}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {mode === 'access'
                  ? 'Passwortschutz mit direkter Weiterleitung auf den gewünschten Bereich.'
                  : 'Produktseite mit Feature-Landschaft, Preismodell und Einstiegspunkten.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function TopFeatures({ tenant }: { tenant: MarketingTenantBranding | null }) {
  const features = tenant ? tenantAccessFeatures : rootAccessFeatures

  return (
    <section className="mt-16">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">
            Top Features
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
            {tenant ? 'Was im Agentur-Tenant auf dich wartet' : 'Was hinter dem Zugang sichtbar wird'}
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-500 dark:text-slate-400">
          {tenant
            ? 'Die Vorschau führt in einen tenant-spezifischen Workspace mit Analyse-, Produktions- und Kundenprozessen.'
            : 'Die Root-Domain erklärt die Plattform, während einzelne Tenants dieselbe Infrastruktur mit eigenem Branding nutzen.'}
        </p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {features.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </div>
    </section>
  )
}

function AccessPanel({ returnTo }: { returnTo?: string }) {
  return (
    <section
      id="access-form"
      className="mt-16 rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-[0_30px_100px_-52px_rgba(15,23,42,0.5)] backdrop-blur dark:border-[#252d3a] dark:bg-[#111827]/90 sm:p-8"
    >
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#0f766e]">
            Passwortschutz
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
            Zugang kurz freischalten
          </h2>
          <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
            Gib das temporäre Projektpasswort ein. Danach wirst du automatisch auf die angeforderte Seite weitergeleitet.
          </p>
          <div className="rounded-[1.5rem] bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-600 dark:bg-[#182131] dark:text-slate-300">
            Die Schutzschicht liegt vor Root-Domain, Owner-Bereich und Tenant-Subdomains. So lassen sich Plattform und Agentur-Tenants gezielt abstimmen, bevor sie offen erreichbar sind.
          </div>
        </div>
        <div className="rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.95))] p-5 dark:border-[#252d3a] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(17,24,39,0.95))] sm:p-6">
          <PreviewAccessForm returnTo={returnTo} />
        </div>
      </div>
    </section>
  )
}

function FeatureGroups({ tenant }: { tenant: MarketingTenantBranding | null }) {
  const groups = tenant ? tenantFeatureGroups : rootFeatureGroups

  return (
    <section className="mt-20 space-y-10">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">
          Feature Set
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl">
          {tenant ? 'Die wichtigsten Funktionen für diesen Tenant' : 'Alle zentralen Plattform-Funktionen im Überblick'}
        </h2>
      </div>

      {groups.map((group) => (
        <div key={group.title} className="rounded-[2rem] border border-white/70 bg-white/70 p-6 shadow-[0_20px_70px_-46px_rgba(15,23,42,0.45)] backdrop-blur dark:border-[#252d3a] dark:bg-[#111827]/80 sm:p-8">
          <div className="max-w-3xl">
            <h3 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{group.title}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{group.intro}</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {group.items.map((item) => (
              <FeatureCard key={item.title} {...item} />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

function PricingSection({ pricing }: { pricing: MarketingPriceItem[] }) {
  if (pricing.length === 0) {
    return null
  }

  const [basePlan, ...modules] = pricing

  return (
    <section className="mt-20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">
            Preise
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl">
            Transparentes Modell aus Basis-Plan und Modulen
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-500 dark:text-slate-400">
          Die Plattform rechnet in 4-Wochen-Zyklen ab. Der Basis-Plan schafft den Workspace, einzelne Module erweitern die Agenturumgebung nach Bedarf.
        </p>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[2rem] bg-[#0f172a] p-8 text-white shadow-[0_30px_100px_-48px_rgba(15,23,42,0.9)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#99f6e4]">
            Einstieg
          </p>
          <h3 className="mt-4 text-3xl font-semibold tracking-tight">{basePlan.name}</h3>
          <div className="mt-5 flex items-end gap-3">
            <span className="text-5xl font-semibold">{formatPrice(basePlan.amount, basePlan.currency)}</span>
            <span className="pb-1 text-sm text-slate-300">/ {basePlan.interval}</span>
          </div>
          <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300">{basePlan.description}</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              'Tenant-Subdomain und Branding',
              'Team-Login mit Rollenmodell',
              'Owner- und Billing-Anbindung',
              'Basis für zubuchbare Module',
            ].map((point) => (
              <div key={point} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                {point}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-[0_30px_100px_-52px_rgba(15,23,42,0.45)] backdrop-blur dark:border-[#252d3a] dark:bg-[#111827]/90 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#0f766e]">
                Zubuchbare Module
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                Funktionsumfang nach Bedarf erweitern
              </h3>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {modules.map((item) => (
              <div
                key={item.code}
                className="flex flex-col gap-2 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-[#252d3a] dark:bg-[#182131] sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="pr-4">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.name}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{item.description}</p>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <p className="text-base font-semibold text-slate-950 dark:text-slate-50">
                    {formatPrice(item.amount, item.currency)}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">/ {item.interval}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs leading-6 text-slate-500 dark:text-slate-400">
            Modulpreise werden aus der aktuellen Billing-Konfiguration geladen. Falls ein Preis nicht öffentlich angezeigt werden kann, bleibt er im Tenant-Billing sichtbar.
          </p>
        </div>
      </div>
    </section>
  )
}

function Cta({ tenant, mode }: { tenant: MarketingTenantBranding | null; mode: PageMode }) {
  const isTenant = Boolean(tenant)

  return (
    <section className="mt-20 rounded-[2rem] border border-[#0f172a]/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.97),rgba(15,118,110,0.9))] p-8 text-white shadow-[0_30px_100px_-48px_rgba(15,23,42,0.9)] sm:p-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#99f6e4]">
            Nächster Schritt
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {mode === 'access'
              ? 'Nach der Freigabe geht es direkt in die passende Umgebung.'
              : isTenant
                ? `Starte direkt im Workspace von ${tenant?.name ?? tenant?.slug}.`
                : 'Nutze BoostHive als White-Label Plattform für deine Agentur.'}
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-200">
            {mode === 'access'
              ? 'Die Vorschau führt ohne Umwege auf Root-Domain, Owner-Zugang oder den jeweiligen Agentur-Tenant.'
              : isTenant
                ? 'Hier sieht man bereits, wie Branding, Teams, Module und Kundenarbeit im Agentur-Tenant zusammenspielen.'
                : 'Die Root-Domain erklärt das Produkt. Jeder Tenant zeigt dieselbe Infrastruktur in einer individuellen Agenturvariante.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={mode === 'access' ? '#access-form' : '/login'}
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            {mode === 'access' ? 'Zugang freischalten' : 'Jetzt einloggen'}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/impressum"
            className="inline-flex items-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Impressum
          </Link>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="mt-12 pb-10">
      <div className="flex flex-col gap-3 rounded-[1.75rem] border border-white/70 bg-white/70 px-6 py-5 text-sm text-slate-500 backdrop-blur dark:border-[#252d3a] dark:bg-[#111827]/80 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>BoostHive verbindet White-Label Plattform, Agenturmodule und sichere Tenant-Zugänge.</p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/datenschutz" className="font-medium text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-slate-50">
            Datenschutz
          </Link>
          <Link href="/impressum" className="font-medium text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-slate-50">
            Impressum
          </Link>
        </div>
      </div>
    </footer>
  )
}

export function MarketingPages({ mode, pricing = [], tenant, returnTo }: MarketingPagesProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(153,246,228,0.38),_rgba(248,250,252,0.92)_38%),radial-gradient(circle_at_bottom_right,_rgba(191,219,254,0.35),_rgba(248,250,252,0.92)_34%),linear-gradient(180deg,rgba(248,250,252,1),rgba(241,245,249,1))] px-4 dark:bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.16),_rgba(2,6,23,0.96)_38%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.18),_rgba(2,6,23,0.96)_34%),linear-gradient(180deg,rgba(15,23,42,1),rgba(2,6,23,1))] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Header tenant={tenant} mode={mode} />
        <Hero tenant={tenant} mode={mode} />
        <TopFeatures tenant={tenant} />
        {mode === 'access' ? (
          <AccessPanel returnTo={returnTo} />
        ) : (
          <>
            <FeatureGroups tenant={tenant} />
            <PricingSection pricing={pricing} />
          </>
        )}
        <Cta tenant={tenant} mode={mode} />
        <Footer />
      </div>
    </main>
  )
}
