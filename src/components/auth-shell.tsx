import Image from 'next/image'
import Link from 'next/link'
import { ReactNode } from 'react'
import { ArrowLeft, CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react'
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
  children: ReactNode
}

const highlights = [
  {
    icon: ShieldCheck,
    title: 'Tenant-sicher',
    description: 'Jeder Einstieg bleibt sauber an den richtigen Workspace gebunden.',
  },
  {
    icon: LockKeyhole,
    title: 'Ruhiger Flow',
    description: 'Klare Formulare, gute Lesbarkeit und wenig visuelle Reibung.',
  },
  {
    icon: CheckCircle2,
    title: 'Schnell zurueck',
    description: 'Von Login bis Recovery fuehrt alles wieder direkt in die App.',
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
  children,
}: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f3efe7] text-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(236,122,65,0.18),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.16),_transparent_32%),linear-gradient(135deg,_#f6efe4_0%,_#f8f4eb_44%,_#eff5ef_100%)]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(255,255,255,0.5),transparent)]" />
      <div className="absolute left-[-5rem] top-[10rem] h-56 w-56 rounded-full bg-[#eb6f3d]/18 blur-3xl" />
      <div className="absolute bottom-[-3rem] right-[-4rem] h-72 w-72 rounded-full bg-[#157f68]/16 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-10">
        <div className="grid w-full gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-stretch">
          <section className="order-2 flex flex-col justify-between rounded-[36px] border border-[#223141] bg-[#1f2937] p-6 text-white shadow-[0_30px_120px_rgba(15,23,42,0.22)] sm:p-8 lg:order-1 lg:min-h-[720px] lg:p-10">
            <div className="space-y-10">
              <div className="flex items-center gap-4">
                <Image
                  src="/favicon_dark.png"
                  alt="BoostHive Logo"
                  width={1264}
                  height={842}
                  priority
                  className="h-14 w-auto object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.22)]"
                />
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.34em] text-slate-300">
                    Secure Workspace Access
                  </p>
                  <p className="text-base font-medium text-slate-200">Workspace Login & Recovery</p>
                </div>
              </div>

              <div className="max-w-xl space-y-5">
                <span className="inline-flex rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.26em] text-[#c9f6e7]">
                  Auth Experience
                </span>
                <h1 className="max-w-lg text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                  {asideTitle}
                </h1>
                <p className="max-w-xl text-base leading-7 text-slate-200 sm:text-lg">
                  {asideDescription}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {highlights.map(({ icon: Icon, title, description }) => (
                  <div
                    key={title}
                    className="rounded-[26px] border border-white/10 bg-white/10 p-4 backdrop-blur-sm"
                  >
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                      <Icon className="h-5 w-5 text-[#c9f6e7]" />
                    </div>
                    <h2 className="text-sm font-semibold text-white">{title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-200">{description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 rounded-[28px] border border-white/10 bg-white/10 p-5 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <Image
                  src="/favicon_dark.png"
                  alt="BoostHive Logo"
                  width={1264}
                  height={842}
                  className="h-10 w-auto object-contain"
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">Sauberes Markenbild</p>
                  <p className="text-sm leading-6 text-slate-300">
                    Das Website-Logo nutzt jetzt das richtige transparente Asset statt des Favicons.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="order-1 lg:order-2">
            <Card className="overflow-hidden rounded-[36px] border border-[#e2d8cb] bg-white shadow-[0_28px_100px_rgba(89,71,42,0.16)]">
              <CardHeader className="space-y-5 border-b border-[#d8d0c4]/70 px-6 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Image
                      src="/favicon_dark.png"
                      alt="BoostHive"
                      width={1264}
                      height={842}
                      className="h-9 w-auto object-contain"
                    />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6d47]">
                        BoostHive
                      </p>
                      <p className="text-sm text-slate-500">Workspace Login & Recovery</p>
                    </div>
                  </div>
                  {backHref && (
                    <Link
                      href={backHref}
                      className="inline-flex items-center gap-2 rounded-full border border-[#d8d0c4] bg-white/80 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-[#b7a181] hover:text-slate-950"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      {backLabel}
                    </Link>
                  )}
                </div>

                <div className="space-y-3">
                  {eyebrow && (
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#b85e34]">
                      {eyebrow}
                    </p>
                  )}
                  <CardTitle className="max-w-lg text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
                    {title}
                  </CardTitle>
                  <CardDescription className="max-w-lg text-sm leading-7 text-slate-600 sm:text-[15px]">
                    {description}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="px-6 py-6 sm:px-8 sm:py-8">
                {children}
                {footer && <div className="mt-8 border-t border-[#e4ddd4] pt-6">{footer}</div>}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  )
}
