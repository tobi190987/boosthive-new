import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Building2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase-admin'
import { getTenantContext } from '@/lib/tenant'

const features = [
  {
    icon: ShieldCheck,
    title: 'Sicherer Tenant-Zugang',
    copy: 'Klare Einstiege für Teams, Admins und einzelne Workspaces.',
  },
  {
    icon: Building2,
    title: 'Isolierte Workspaces',
    copy: 'Jede Agentur erhält eine eigene, vollständig isolierte Umgebung.',
  },
  {
    icon: LockKeyhole,
    title: 'Sauberer Recovery-Flow',
    copy: 'Passwort-Reset bleibt visuell und technisch in einer Linie.',
  },
]

export default async function Home() {
  const tenant = await getTenantContext()
  let tenantLogoUrl: string | undefined

  if (tenant?.id) {
    const supabaseAdmin = createAdminClient()
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('name, logo_url')
      .eq('id', tenant.id)
      .maybeSingle()

    tenantLogoUrl = data?.logo_url ?? undefined
  }

  return (
    <main className="min-h-screen bg-[#f0f4f8] px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <header className="flex items-center justify-between py-4 mb-12">
          <Link href="/" className="flex items-center">
            {tenantLogoUrl ? (
              <Image
                src={tenantLogoUrl}
                alt={`${tenant?.slug ?? 'Tenant'} Logo`}
                width={240}
                height={80}
                priority
                unoptimized
                className="h-10 w-auto max-w-[220px] object-contain"
              />
            ) : (
              <Image
                src="/boosthive_light.png"
                alt="BoostHive Logo"
                width={759}
                height={213}
                priority
                className="h-10 w-auto object-contain"
              />
            )}
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300"
            >
              Tenant Login
            </Link>
            <Link
              href="/owner/login"
              className="inline-flex items-center justify-center rounded-lg bg-[#0f1c2e] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#1a2f45]"
            >
              Owner Login
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center mb-20">
          <div className="space-y-6">
            <span className="inline-flex items-center rounded-full border border-[#d1faf4] bg-[#f0fdfb] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#0d9488]">
              SaaS Platform
            </span>
            <div className="space-y-4">
              <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
                {tenant
                  ? `Willkommen bei ${tenant.slug}.`
                  : 'White-Label Marketing Plattform für Agenturen.'}
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-500">
                {tenant
                  ? 'Melde dich in euren Workspace ein und arbeite in eurer eigenen, gebrandeten Umgebung.'
                  : 'Jede Agentur erhält ihre eigene Subdomain, ihr eigenes Branding und eine vollständig isolierte Arbeitsumgebung.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-[#1dbfaa] px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_14px_rgba(29,191,170,0.28)] transition hover:bg-[#18a896]"
              >
                Zum Login
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/owner/login"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300"
              >
                Owner Bereich
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-3 mb-5 pb-5 border-b border-slate-100">
              {tenantLogoUrl ? (
                <Image
                  src={tenantLogoUrl}
                  alt={`${tenant?.slug ?? 'Tenant'} Logo`}
                  width={240}
                  height={80}
                  unoptimized
                  className="h-10 w-auto max-w-[180px] object-contain"
                />
              ) : (
                <Image
                  src="/boosthive_light.png"
                  alt="BoostHive"
                  width={1264}
                  height={842}
                  className="h-10 w-auto object-contain"
                />
              )}
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {tenant ? `${tenant.slug}.boost-hive.de` : 'BoostHive Platform'}
                </p>
                <p className="text-xs text-slate-400">
                  {tenant ? 'Gebrandeter Tenant-Zugang' : 'Multi-Tenant SaaS'}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {features.map(({ icon: Icon, title, copy }) => (
                <div key={title} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f0fdfb]">
                    <Icon className="h-4 w-4 text-[#1dbfaa]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">{copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </main>
  )
}
