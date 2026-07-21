import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the real dashboard grid — header, priority strip, four
// metric tiles, then the panel rows — so content lands in place rather
// than shoving the page around when the queries resolve.
export default function DashboardLoading() {
  return (
    <div className="ops-page" aria-busy role="status" aria-label="Loading">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      <div className="ops-surface p-3">
        <Skeleton className="mb-3 h-4 w-24" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[136px] rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Skeleton className="h-72 rounded-xl xl:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl xl:col-span-2" />
      </div>
    </div>
  );
}
