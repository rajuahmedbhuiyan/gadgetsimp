/**
 * The placeholder a product grid streams behind.
 *
 * Mirrors `ProductCard`'s box model exactly - same aspect ratio, same padding,
 * same number of text rows - so the real cards replace it without the grid
 * jumping.
 */

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function ProductCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border bg-card",
        className,
      )}
    >
      <Skeleton className="aspect-square rounded-none" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="mt-2 h-5 w-24" />
        <Skeleton className="mt-1 h-9 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-5">
      {Array.from({ length: count }, (_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  );
}
