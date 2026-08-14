/**
 * The checkout placeholder.
 *
 * Its own component rather than the cart's: checkout is a `1.5fr / 1fr` grid
 * of form sections beside a summary, while the cart is `1.7fr / 1fr` of list
 * rows. Borrowing the cart's meant the page visibly rearranged the moment the
 * real form arrived.
 *
 * Mirrors the real thing section by section - two fields, then five, then the
 * payment box and the submit button - so the swap is a fill.
 */

import { Skeleton } from "@/components/ui/skeleton";

export function CheckoutSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
      <div className="flex flex-col gap-6">
        <SectionSkeleton rows={1} columns={2} />
        <SectionSkeleton rows={4} columns={2} tall />
        <PaymentSkeleton />
        <Skeleton className="h-12 w-full rounded-field" />
      </div>

      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-10" />
        </div>

        <ul className="divide-y">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="flex items-center gap-3 py-3">
              <Skeleton className="size-12 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-14 shrink-0" />
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-2.5 border-t pt-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>

        <div className="mt-4 flex items-center justify-between border-t pt-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
    </div>
  );
}

function SectionSkeleton({
  rows,
  columns,
  tall,
}: {
  rows: number;
  columns: number;
  tall?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <Skeleton className="mb-4 h-4 w-32" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, row) => (
          <div
            key={row}
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }, (_, column) => (
              <div key={column} className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-12 w-full rounded-field" />
              </div>
            ))}
          </div>
        ))}

        {/* The delivery-note textarea at the end of the address section. */}
        {tall ? (
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-20 w-full rounded-field" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PaymentSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <Skeleton className="mb-4 h-4 w-24" />
      <div className="flex items-start gap-3 rounded-field border-2 border-dashed p-4">
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-56 max-w-full" />
        </div>
      </div>
    </div>
  );
}
