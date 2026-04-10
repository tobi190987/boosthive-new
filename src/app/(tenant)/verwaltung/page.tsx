import { forbidden, redirect } from 'next/navigation'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { createAdminClient } from '@/lib/supabase-admin'
import Link from 'next/link'
import { ArrowRight, CreditCard, ShieldCheck, UserRound, Users2 } from 'lucide-react'

interface VerwaltungStats {
  customerCount: number
  memberCount: number
  pendingInvitations: number
  subscriptionStatus: string | null
}

async function loadStats(tenantId: string): Promise<VerwaltungStats> {
  const admin = createAdminClient()

  const [customersResult, membersResult, invitationsResult, tenantResult] = await Promise.all([
    admin
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
    admin
      .from('tenant_members')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
    admin
      .from('tenant_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('accepted_at', null)
      .is('revoked_at', null),
    admin
      .from('tenants')
      .select('subscription_status')
      .eq('id', tenantId)
      .single(),
  ])

  return {
    customerCount: customersResult.count ?? 0,
    memberCount: membersResult.count ?? 0,
    pendingInvitations: invitationsResult.count ?? 0,
    subscriptionStatus: (tenantResult.data as { subscription_status?: string | null } | null)?.subscription_status ?? null,
  }
}

function subscriptionLabel(status: string | null): string {
  switch (status) {
    case 'active': return 'Abo aktiv'
    case 'canceling': return 'Abo läuft aus'
    case 'past_due': return 'Zahlung ausstehend'
    case 'canceled': return 'Abo gekündigt'
    default: return 'Kein Abo aktiv'
  }
}

export default async function VerwaltungPage() {
  const context = await requireTenantShellContext()

  if (!context.onboarding.isComplete) {
    redirect('/onboarding')
  }

  if (context.membership.role !== 'admin') {
    forbidden()
  }

  const stats = await loadStats(context.tenant.id)

  const VERWALTUNG_ITEMS = [
    {
      label: 'Kunden',
      description: 'Verwalte deine Kunden und ordne ihnen Analyse-Daten zu.',
      stat: `${stats.customerCount} aktive Kunden`,
      href: '/tools/customers',
      icon: UserRound,
      iconBg: 'bg-blue-50 dark:bg-blue-950/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Team & Einladungen',
      description: 'Lade Mitarbeiter ein und verwalte Rollen und Zugriffsrechte.',
      stat: stats.pendingInvitations > 0
        ? `${stats.memberCount} Mitglieder · ${stats.pendingInvitations} ausstehend`
        : `${stats.memberCount} Mitglieder`,
      href: '/settings/team',
      icon: Users2,
      iconBg: 'bg-violet-50 dark:bg-violet-950/40',
      iconColor: 'text-violet-600 dark:text-violet-400',
    },
    {
      label: 'Rechtliches & Datenschutz',
      description: 'Impressum, Datenschutzerklärung und Auftragsverarbeiter verwalten.',
      stat: 'DSGVO-konform',
      href: '/settings/legal',
      icon: ShieldCheck,
      iconBg: 'bg-slate-100 dark:bg-slate-800/60',
      iconColor: 'text-slate-600 dark:text-slate-400',
    },
    {
      label: 'Abrechnung',
      description: 'Dein Abonnement, gebuchte Module und Rechnungen im Überblick.',
      stat: subscriptionLabel(stats.subscriptionStatus),
      href: '/billing',
      icon: CreditCard,
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
  ]

  return (
    <div className="space-y-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Verwaltung</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
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
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.iconBg}`}>
                  <Icon className={`h-5 w-5 ${item.iconColor}`} />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {item.description}
                </p>
                <p className="mt-2 text-xs font-medium text-slate-400 dark:text-slate-500">
                  {item.stat}
                </p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
