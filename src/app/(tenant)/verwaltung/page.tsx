import { forbidden, redirect } from 'next/navigation'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import Link from 'next/link'
import { ArrowRight, CreditCard, ShieldCheck, UserRound, Users2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const VERWALTUNG_ITEMS = [
  {
    label: 'Kunden',
    description: 'Verwalte deine Kunden und ordne ihnen Analyse-Daten zu.',
    href: '/tools/customers',
    icon: UserRound,
  },
  {
    label: 'Team & Einladungen',
    description: 'Lade Mitarbeiter ein und verwalte Rollen und Zugriffsrechte.',
    href: '/settings/team',
    icon: Users2,
  },
  {
    label: 'Rechtliches & Datenschutz',
    description: 'Impressum, Datenschutzerklärung und Auftragsverarbeiter verwalten.',
    href: '/settings/legal',
    icon: ShieldCheck,
  },
  {
    label: 'Abrechnung',
    description: 'Dein Abonnement, gebuchte Module und Rechnungen im Überblick.',
    href: '/billing',
    icon: CreditCard,
  },
]

export default async function VerwaltungPage() {
  const context = await requireTenantShellContext()

  if (!context.onboarding.isComplete) {
    redirect('/onboarding')
  }

  if (context.membership.role !== 'admin') {
    forbidden()
  }

  return (
    <div className="space-y-8">
      <div>
        <Badge className="mb-3 w-fit rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white hover:bg-slate-900">
          Verwaltung
        </Badge>
        <h1 className="font-headline text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
          Verwaltung
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500 dark:text-slate-400">
          Kunden, Team, Rechtliches und Abrechnung – alles Organisatorische an einem Ort.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {VERWALTUNG_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-soft transition-all hover:border-slate-200 hover:shadow-md dark:border-border dark:bg-card dark:hover:border-[#3d4a5c]"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800/60">
                  <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {item.description}
                </p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
