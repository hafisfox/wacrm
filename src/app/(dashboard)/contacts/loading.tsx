import { Skeleton } from '@/components/ui/skeleton';

export default function ContactsLoading() {
  return (
    <div className="ops-page" aria-busy role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-48" />
      </div>

      <div className="ops-surface space-y-4 p-4">
        <Skeleton className="h-9 w-full max-w-md" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
