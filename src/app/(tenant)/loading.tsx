function TenantPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="h-8 w-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[1.5rem] border border-slate-100 bg-white p-5 dark:border-border dark:bg-card"
          >
            <div className="space-y-3">
              <div className="h-5 w-36 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-full animate-pulse rounded-full bg-slate-100 dark:bg-slate-900" />
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-100 dark:bg-slate-900" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Loading() {
  return <TenantPageSkeleton />
}
