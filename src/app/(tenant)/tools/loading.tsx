export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="h-8 w-56 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="h-10 w-36 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[1.5rem] border border-slate-100 bg-white p-5 dark:border-border dark:bg-card"
          >
            <div className="space-y-3">
              <div className="h-5 w-40 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-full animate-pulse rounded-full bg-slate-100 dark:bg-slate-900" />
              <div className="h-4 w-3/4 animate-pulse rounded-full bg-slate-100 dark:bg-slate-900" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
