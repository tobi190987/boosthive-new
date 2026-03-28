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
    <section className="relative overflow-hidden rounded-[34px] border border-[#e6ddd0] bg-[linear-gradient(135deg,#fffaf2_0%,#f6efe5_52%,#edf6f4_100%)] p-6 shadow-[0_24px_80px_rgba(89,71,42,0.08)] sm:p-8">
      <div className="absolute left-[-2rem] top-[-2rem] h-40 w-40 rounded-full bg-[#1dbfaa]/10 blur-3xl" />
      <div className="absolute bottom-[-3rem] right-[-1rem] h-44 w-44 rounded-full bg-[#eb6f3d]/12 blur-3xl" />

      <div className="relative">
        <div className="max-w-3xl space-y-4">
          <Badge className="w-fit rounded-full bg-[#1f2937] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white hover:bg-[#1f2937]">
            {eyebrow}
          </Badge>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b85e34]">
              {context.tenant.name} / {context.tenant.slug}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                {description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
