export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-64 animate-pulse rounded-full bg-slate-100 dark:bg-slate-900" />
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-slate-100 bg-white p-4 dark:border-[#252d3a] dark:bg-[#151c28]"
          >
            <div className="space-y-3">
              <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
              <div className="h-6 w-12 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-24 animate-pulse rounded-full bg-slate-100 dark:bg-slate-900" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
