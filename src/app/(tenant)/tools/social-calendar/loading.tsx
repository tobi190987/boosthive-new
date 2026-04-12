import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-[280px]" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-9 w-9" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px rounded-2xl border bg-slate-100 dark:bg-border">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-none bg-white dark:bg-card" />
        ))}
      </div>
    </div>
  )
}
