import Image from 'next/image'
import Link from 'next/link'
import { ReactNode } from 'react'
import { ArrowLeft, Building2, KeyRound, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AuthShellProps {
  eyebrow?: string
  title: string
  description: string
  asideTitle: string
  asideDescription: string
  backHref?: string
  backLabel?: string
  footer?: ReactNode
  tenantLogoUrl?: string
  children: ReactNode
}

const highlights = [
  {
    icon: ShieldCheck,
    title: 'Tenant-sicher',
    description: 'Jeder Einstieg bleibt klar an den richtigen Workspace gebunden.',
  },
  {
    icon: KeyRound,
    title: 'Ruhiger Flow',
    description: 'Klare Formulare, gute Lesbarkeit und wenig visuelle Reibung.',
  },
  {
    icon: Building2,
    title: 'Schnell zurück',
    description: 'Von Login bis Recovery führt alles direkt zurück in die App.',
  },
]

export function AuthShell({
  eyebrow,
  title,
  description,
  asideTitle,
  asideDescription,
  backHref,
  backLabel = 'Zur Anmeldung',
  footer,
  tenantLogoUrl,
  children,
}: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f8fafc] text-slate-950 dark:text-slate-50">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(37,99,235,0.10),_transparent_40%),radial-gradient(ellipse_at_bottom_right,_rgba(37,99,235,0.06),_transparent_40%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-10">
        <div className="grid w-full gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">

          {/* Left: Dark Panel */}
          <section className="order-2 flex flex-col justify-between rounded-2xl border border-[#1e2d3d] bg-[#0f1c2e] p-6 text-white shadow-[0_20px_80px_rgba(0,0,0,0.20)] sm:p-8 lg:order-1 lg:min-h-[660px] lg:p-10">
            <div className="space-y-8">
              <div className="flex items-center gap-3">
                {tenantLogoUrl ? (
                  <Image
                    src={tenantLogoUrl}
                    alt="Agentur Logo"
                    width={240}
                    height={80}
                    priority
                    className="h-10 w-auto max-w-[200px] object-contain"
                  />
                ) : (
                  <Image
                    src="/boosthive_dark.png"
                    alt="BoostHive Logo"
                    width={759}
                    height={213}
                    priority
                    className="h-10 w-auto object-contain"
                  />
                )}
              </div>

              <div className="space-y-4">
                <span className="inline-flex rounded-full border border-blue-500/30 bg-blue-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
                  Auth Experience
                </span>
                <h1 className="max-w-lg text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                  {asideTitle}
                </h1>
                <p className="max-w-lg text-sm leading-7 text-slate-300 sm:text-base">
                  {asideDescription}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {highlights.map(({ icon: Icon, title, description }) => (
                  <div
                    key={title}
                    className="rounded-xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20">
                      <Icon className="h-4 w-4 text-blue-300" />
                    </div>
                    <h2 className="text-sm font-semibold text-white">{title}</h2>
                    <p className="mt-1.5 text-xs leading-5 text-slate-400 dark:text-slate-500">{description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
                <ShieldCheck className="h-4 w-4 text-blue-300" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">BoostHive Platform</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">Sichere, isolierte Workspaces für jede Agentur.</p>
              </div>
            </div>
          </section>

          {/* Right: Form Card */}
          <section className="order-1 lg:order-2">
            <Card className="overflow-hidden rounded-2xl border border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-[0_8px_40px_rgba(15,23,42,0.08)]">
              <CardHeader className="space-y-4 border-b border-slate-100 dark:border-[#252d3a] px-6 pb-5 pt-6 sm:px-8 sm:pt-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {tenantLogoUrl ? (
                      <Image
                        src={tenantLogoUrl}
                        alt="Agentur Logo"
                        width={240}
                        height={80}
                        className="h-8 w-auto max-w-[180px] object-contain"
                      />
                    ) : (
                      <Image
                        src="/boosthive_light.png"
                        alt="BoostHive"
                        width={759}
                        height={213}
                        className="h-8 w-auto object-contain"
                      />
                    )}
                  </div>
                  {backHref && (
                    <Link
                      href={backHref}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 transition hover:border-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      {backLabel}
                    </Link>
                  )}
                </div>

                <div className="space-y-2">
                  {eyebrow && (
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-500">
                      {eyebrow}
                    </p>
                  )}
                  <CardTitle className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-[1.75rem]">
                    {title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {description}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="px-6 py-6 sm:px-8 sm:py-7">
                {children}
                {footer && <div className="mt-6 border-t border-slate-100 dark:border-[#252d3a] pt-5">{footer}</div>}
              </CardContent>
            </Card>
          </section>

        </div>
      </div>
    </div>
  )
}
