import Image from 'next/image'
import Link from 'next/link'
import { ReactNode } from 'react'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AuthShellProps {
  variant?: 'tenant' | 'owner'
  minimal?: boolean
  eyebrow?: string
  hideEyebrow?: boolean
  title: string
  description: string
  backHref?: string
  backLabel?: string
  contextLabel?: string
  footer?: ReactNode
  brandLogoUrl?: string
  brandAlt?: string
  brandLogoClassName?: string
  children: ReactNode
}

export function AuthShell({
  variant = 'tenant',
  minimal = false,
  eyebrow,
  hideEyebrow = false,
  title,
  description,
  backHref,
  backLabel = 'Zur Anmeldung',
  contextLabel,
  footer,
  brandLogoUrl,
  brandAlt = 'BoostHive',
  brandLogoClassName,
  children,
}: AuthShellProps) {
  const isOwner = variant === 'owner'
  const accentClasses = isOwner
    ? {
        page: 'bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.12),_transparent_45%),linear-gradient(180deg,#fffaf0_0%,#f8fafc_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.18),_transparent_45%),linear-gradient(180deg,#0f172a_0%,#020617_100%)]',
        badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300',
        context: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200',
      }
    : {
        page: 'bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.10),_transparent_45%),linear-gradient(180deg,#f8fbff_0%,#f8fafc_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.18),_transparent_45%),linear-gradient(180deg,#0f172a_0%,#020617_100%)]',
        badge: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-300',
        context: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-200',
      }

  return (
    <div className={`min-h-screen px-4 py-6 text-slate-950 dark:text-slate-50 sm:px-6 sm:py-10 ${accentClasses.page}`}>
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md items-center">
        <Card className="w-full overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur dark:border-border dark:bg-card/95">
          {!minimal && (
            <CardHeader className="space-y-5 px-5 pb-4 pt-5 sm:px-8 sm:pb-5 sm:pt-8">
              <div className="flex items-start justify-between gap-4">
                {backHref ? (
                  <Link
                    href={backHref}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-border dark:bg-card dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-100"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    {backLabel}
                  </Link>
                ) : (
                  <span />
                )}

                {hideEyebrow ? (
                  <span />
                ) : (
                  <div
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${accentClasses.badge}`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {eyebrow ?? (isOwner ? 'Owner Access' : 'Login')}
                  </div>
                )}
              </div>

              <div className="space-y-4 text-center">
                <div className="flex justify-center">
                  {brandLogoUrl ? (
                    <Image
                      src={brandLogoUrl}
                      alt={brandAlt}
                      width={240}
                      height={80}
                      priority
                      className={brandLogoClassName ?? 'h-12 w-auto max-w-[220px] object-contain sm:h-14'}
                    />
                  ) : (
                    <Image
                      src={isOwner ? '/boosthive_dark.png' : '/boosthive_light.png'}
                      alt={brandAlt}
                      width={759}
                      height={213}
                      priority
                      className="h-10 w-auto object-contain sm:h-12"
                    />
                  )}
                </div>

                {contextLabel && (
                  <div
                    className={`inline-flex max-w-full items-center justify-center rounded-full border px-3 py-1.5 text-xs font-medium ${accentClasses.context}`}
                  >
                    {contextLabel}
                  </div>
                )}

                <div className="space-y-2">
                  <CardTitle className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-[1.9rem]">
                    {title}
                  </CardTitle>
                  <CardDescription className="mx-auto max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          )}

          <CardContent className={minimal ? 'px-5 py-5 sm:px-8 sm:py-8' : 'px-5 pb-5 pt-3 sm:px-8 sm:pb-8 sm:pt-4'}>
            {children}
            {footer && <div className="mt-6 border-t border-slate-100 pt-5 dark:border-border">{footer}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
