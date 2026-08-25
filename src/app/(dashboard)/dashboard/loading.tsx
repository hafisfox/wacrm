import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the shipped daybook: heading and actions, shift totals, live
// shift brief, then the appointment ledger with its exception rail.
// Matching the real geometry keeps route transitions stable on phone
// and desktop.
export default function DashboardLoading() {
  return (
    <div className="ops-page" aria-busy role="status" aria-label="Loading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Skeleton className="col-span-2 h-7 w-full sm:col-span-1 sm:w-32" />
          <Skeleton className="h-11 w-full sm:w-28" />
          <Skeleton className="h-11 w-full sm:w-28" />
        </div>
      </div>

      <div className="ops-surface overflow-hidden">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="divide-border grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2 px-4 py-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      </div>

      <div className="ops-surface overflow-hidden">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-14" />
        </div>
        <div className="divide-border grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex min-h-28 gap-3 px-4 py-4 sm:min-h-32">
              <Skeleton className="size-9 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-14" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-[28rem] rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
