import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-[120px] w-full rounded-2xl" />
      <Skeleton className="h-[400px] w-full rounded-2xl" />
    </div>
  )
}
