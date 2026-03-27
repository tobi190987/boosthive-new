import Image from 'next/image'
import Link from 'next/link'
import { PreviewAccessForm } from '@/components/preview-access-form'

interface AccessPageProps {
  searchParams: Promise<{ returnTo?: string }>
}

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const params = await searchParams

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f7f2e9_0%,#f1eee8_52%,#eaf5f2_100%)] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex min-h-[calc(100vh-5rem)] items-center">
          <div className="grid w-full gap-8 lg:grid-cols-[1.08fr_0.92fr]">
            <section className="relative overflow-hidden rounded-[36px] border border-[#ddd4c8] bg-[#1f2937] p-8 text-white shadow-[0_30px_100px_rgba(31,41,55,0.24)] sm:p-10">
              <div className="absolute left-[-2rem] top-[-2rem] h-40 w-40 rounded-full bg-[#1dbfaa]/20 blur-3xl" />
              <div className="absolute bottom-[-2rem] right-[-1rem] h-44 w-44 rounded-full bg-[#eb6f3d]/20 blur-3xl" />

              <div className="relative space-y-8">
                <div className="flex items-center gap-3">
                  <Image
                    src="/boosthive_light.png"
                    alt="BoostHive"
                    width={759}
                    height={213}
                    className="h-8 w-auto object-contain"
                  />
                </div>

                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#88e7d8]">
                    Temporary Access Gate
                  </p>
                  <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                    BoostHive ist vorübergehend zusätzlich geschützt.
                  </h1>
                  <p className="max-w-xl text-base leading-7 text-slate-300">
                    Root-Domain und alle Tenant-Subdomains sind aktuell mit einer temporären
                    Passwortschranke versehen, damit Inhalte nur für freigegebene Personen
                    sichtbar sind.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[26px] border border-white/10 bg-white/5 p-5">
                    <p className="text-sm font-semibold text-white">Temporär vor Launch</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Die Schranke liegt bewusst vor Root, Owner und Tenant-Workspaces.
                    </p>
                  </div>
                  <div className="rounded-[26px] border border-white/10 bg-white/5 p-5">
                    <p className="text-sm font-semibold text-white">
                      Nach Freigabe sofort weiter
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Nach erfolgreicher Eingabe wirst du automatisch auf die gewünschte URL
                      weitergeleitet.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-[#dfd5c8] bg-[#fffdf9] p-6 shadow-[0_24px_80px_rgba(89,71,42,0.12)] sm:p-8">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b85e34]">
                  Passwortschutz
                </p>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                  Zugang kurz freischalten
                </h2>
                <p className="text-sm leading-7 text-slate-600">
                  Gib das temporäre Projektpasswort ein, um Root-Domain, Owner-Bereich und
                  Tenant-Subdomains anzusehen.
                </p>
              </div>

              <div className="mt-8">
                <PreviewAccessForm returnTo={params.returnTo} />
              </div>
            </section>
          </div>
        </div>

        <section className="mt-10 pb-10">
          <div className="rounded-[28px] border border-[#dfd5c8] bg-[#fffdf9] px-6 py-5 shadow-[0_24px_80px_rgba(89,71,42,0.08)] sm:px-8">
            <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <p>Rechtliche Informationen und Datenschutz findest du auf den separaten Seiten.</p>
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/impressum"
                  className="font-medium text-[#b85e34] underline decoration-[#d7a182] underline-offset-4"
                >
                  Impressum
                </Link>
                <Link
                  href="/datenschutz"
                  className="font-medium text-[#b85e34] underline decoration-[#d7a182] underline-offset-4"
                >
                  Datenschutzerklärung
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
