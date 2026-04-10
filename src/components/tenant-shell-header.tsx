import { Badge } from '@/components/ui/badge'
import type { TenantShellContext } from '@/lib/tenant-shell'

interface TenantShellHeaderProps {
  context: TenantShellContext
  eyebrow: string
  title: string
  description: string
}

export function TenantShellHeader({
  context,
  eyebrow,
  title,
  description,
}: TenantShellHeaderProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-6 shadow-soft sm:p-8">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 via-transparent to-transparent dark:from-blue-950/20 dark:via-transparent dark:to-transparent" />

      <div className="relative">
        <div className="max-w-3xl space-y-4">
          <Badge className="w-fit rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white hover:bg-slate-900">
            {eyebrow}
          </Badge>
          <div>
            <h1 className="font-headline text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500 dark:text-slate-400 sm:text-base">
                {description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
