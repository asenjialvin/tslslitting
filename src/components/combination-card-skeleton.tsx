import { Skeleton } from "@/components/ui/skeleton";

export function CombinationCardSkeleton() {
  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex flex-wrap gap-1.5 px-3 py-3">
        <Skeleton className="h-11 w-20" />
        <Skeleton className="h-11 w-20" />
        <Skeleton className="h-11 w-20" />
      </div>
    </div>
  );
}

export function CombinationListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <CombinationCardSkeleton key={i} />
      ))}
    </div>
  );
}
