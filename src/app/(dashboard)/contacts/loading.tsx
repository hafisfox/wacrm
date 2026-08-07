import { Skeleton } from '@/components/ui/skeleton';

export default function ContactsLoading() {
  return (
    <div className="ops-page" aria-busy role="status" aria-label="Loading">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="ml-auto h-7 w-32" />
          <Skeleton className="h-14 w-64 max-w-full rounded-lg" />
        </div>
      </div>

      <div className="ops-surface space-y-3 p-3">
        <Skeleton className="h-11 w-full max-w-xl" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-20 shrink-0 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-3 w-44" />
      </div>

      <div className="ops-surface space-y-2 p-2 lg:p-0">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton
            key={i}
            className="h-36 rounded-xl lg:h-20 lg:rounded-none"
          />
        ))}
      </div>
    </div>
  );
}
