/**
 * Streaming fallbacks for the catalogue sections.
 *
 * Each one reuses the same `<Section>` shell as the component it stands in
 * for, so the heading and the spacing are already correct while the products
 * are still in flight - only the tiles swap. That is what keeps the page from
 * jumping as each `<Suspense>` boundary resolves.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { ProductCardSkeleton } from "@/components/product/product-card-skeleton";
import { Section } from "./section";

export function FeaturedProductsSkeleton() {
  return (
    <Section
      eyebrow="Hand picked"
      title="Featured this week"
      description="The gadgets our team keeps recommending - all in stock and ready to ship today."
      href="/shop?featured=true"
    >
      <div className="flex gap-3 overflow-hidden lg:gap-4">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="w-full shrink-0 xs:w-[46%] sm:w-1/3 lg:w-1/4 xl:w-1/5"
          >
            <ProductCardSkeleton />
          </div>
        ))}
      </div>
    </Section>
  );
}

export function CategoryGridSkeleton() {
  return (
    <Section
      eyebrow="Browse"
      title="Shop by category"
      description="Twelve shelves, one shop. Start where you already know what you want."
      href="/categories"
      linkLabel="All categories"
      className="bg-muted/30"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col items-center gap-3 rounded-xl border bg-card p-4"
          >
            <Skeleton className="size-16 rounded-full lg:size-20" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </Section>
  );
}

export function LatestProductsSkeleton() {
  return (
    <Section
      eyebrow="Fresh stock"
      title="New in the shop"
      description="The latest additions to the catalogue, newest first."
      href="/shop"
      linkLabel="Browse everything"
    >
      <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    </Section>
  );
}
