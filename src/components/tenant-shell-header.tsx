import { Badge } from '@/components/ui/badge'
import { TenantLogoutButton } from '@/components/tenant-logout-button'
import type { TenantShellContext } from '@/lib/tenant-shell'

interface TenantShellHeaderProps {
  context: TenantShellContext
  eyebrow: string
  title: string
  description: string
}

function roleLabel(role: TenantShellContext['membership']['role']) {
  return role === 'admin' ? 'Admin' : 'Member'
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

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
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
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              {description}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="min-w-0 rounded-[24px] border border-white/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Eingeloggt als
            </p>
            <p className="mt-2 break-all text-sm font-semibold text-slate-900">{context.user.email}</p>
          </div>
          <div className="rounded-[24px] border border-white/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Rolle
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{roleLabel(context.membership.role)}</p>
          </div>
          <TenantLogoutButton className="h-full rounded-[24px] border-white/80 bg-white/80 px-5 shadow-sm backdrop-blur-sm" />
        </div>
      </div>
    </section>
  )
}
