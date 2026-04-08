export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-64 animate-pulse rounded-full bg-slate-100 dark:bg-slate-900" />
      </div>

      {/* KPI Grid Skeleton */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-slate-100 bg-white p-5 dark:border-border dark:bg-card"
          >
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
              <div className="flex-1 space-y-2">
                <div className="h-7 w-20 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
                <div className="h-4 w-24 animate-pulse rounded-full bg-slate-100 dark:bg-slate-900" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Accordion Skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-slate-100 bg-white p-5 dark:border-border dark:bg-card"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
              <div className="h-5 w-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
              <div className="h-5 w-24 animate-pulse rounded-full bg-slate-100 dark:bg-slate-900" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
