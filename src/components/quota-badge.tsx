'use client'

import { useQuota } from '@/hooks/use-quota'
import type { QuotaMetric } from '@/lib/usage-limits'

interface QuotaBadgeProps {
  metric: QuotaMetric
  label: string
}

function formatResetDate(isoDate: string): string {
  if (!isoDate) return ''
  return new Date(isoDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

export function QuotaBadge({ metric, label }: QuotaBadgeProps) {
  const quota = useQuota(metric)

  if (quota.loading || quota.limit === 0) return null

  const isExhausted = quota.current >= quota.limit
  const isNearLimit = quota.current >= quota.limit * 0.9
  const fillPct = Math.min(100, (quota.current / quota.limit) * 100)

  const barColor = isExhausted
    ? 'bg-red-500'
    : isNearLimit
      ? 'bg-amber-400'
      : 'bg-emerald-500'

  return (
    <div className="flex flex-col gap-1">
      <span
        className={[
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          isExhausted
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            : isNearLimit
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
        ].join(' ')}
      >
        {quota.current}&thinsp;/&thinsp;{quota.limit} {label}
        {quota.reset_at && (
          <span className="ml-1 opacity-70">(Reset: {formatResetDate(quota.reset_at)})</span>
        )}
      </span>
      <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={['h-1 rounded-full transition-all', barColor].join(' ')}
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  )
}
