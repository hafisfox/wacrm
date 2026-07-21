import { Skeleton } from '@/components/ui/skeleton';

export default function SalonControlLoading() {
  return (
    <div className="ops-page" aria-busy role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>

      {/* Tab strip, then the active panel. */}
      <Skeleton className="h-10 w-full max-w-xl rounded-lg" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
