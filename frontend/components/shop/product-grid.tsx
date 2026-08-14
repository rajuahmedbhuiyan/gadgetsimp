"use client";

/**
 * The virtualised product grid.
 *
 * `VirtuosoGrid` in **window-scroll** mode: the page scrolls, not a box inside
 * it. A shop that scrolls internally breaks the phone behaviours people expect
 * - the URL bar does not collapse, momentum stops at the container edge, and
 * the footer becomes unreachable. `useWindowScroll` keeps all of that intact
 * while still mounting only the rows near the viewport.
 *
 * The layout stays plain CSS. Virtuoso measures whatever the list renders, so
 * the responsive column count is a normal grid class rather than a computed
 * width - one breakpoint set, honoured by both the real grid and its skeleton.
 *
 * `endReached` drives the paging. It fires once per index rather than per
 * scroll event, and the query's own `isFetchingNextPage` guards the rest, so
 * a fast scroll cannot stack duplicate requests.
 */

import { useCallback } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import { Loader2, PackageSearch, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ProductCard as ProductCardData } from "@/lib/api/shop";
import { ProductCard } from "@/components/product/product-card";
import { ProductCardSkeleton } from "@/components/product/product-card-skeleton";
import { Button } from "@/components/ui/button";

/**
 * One breakpoint set, used by the grid and the skeleton alike.
 *
 * 1 → 2 → 3 → 4 → **3** → 4 as the window widens, and the step backwards at
 * `lg` is deliberate: that is where the filter sidebar appears and takes 256px
 * off the grid, so the same four columns would be narrower there than three
 * are at 1000px. The count follows the space available, not the window.
 *
 * `xs` is the project's 380px breakpoint - below it two columns leave each
 * card too narrow to read a name and a price. The 650 and 900 stops are
 * arbitrary variants rather than theme breakpoints because they describe this
 * grid rather than the site's layout language.
 */
const GRID_CLASS =
  "grid grid-cols-1 gap-3 xs:grid-cols-2 min-[650px]:grid-cols-3 min-[900px]:grid-cols-4 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4";

export function ProductGrid({
  products,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  failed,
  onEndReached,
  onRetry,
  onClear,
}: {
  products: ProductCardData[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  failed: boolean;
  onEndReached: () => void;
  onRetry: () => void;
  onClear: () => void;
}) {
  const endReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) onEndReached();
  }, [hasNextPage, isFetchingNextPage, onEndReached]);

  if (isLoading) return <GridSkeleton />;
  if (failed) return <LoadFailed onRetry={onRetry} />;
  if (products.length === 0) return <NoResults onClear={onClear} />;

  return (
    <VirtuosoGrid
      useWindowScroll
      data={products}
      endReached={endReached}
      /*
       * Renders a screen of cards beyond the viewport in both directions. The
       * default is tighter and, on a fast flick, hands back blank space while
       * the next rows mount - a grid of images is exactly where that shows.
       */
      increaseViewportBy={{ top: 600, bottom: 900 }}
      components={GRID_COMPONENTS}
      itemContent={(index, product) => (
        <ProductCard
          product={product}
          // Only the first row is eager; the rest are below the fold and
          // lazy-loading them is the point.
          priority={index < 4}
        />
      )}
      // Keyed by id, not index: the list grows as pages arrive, and an
      // index key would remount every card each time.
      computeItemKey={(_, product) => product.id}
    />
  );
}

/*
 * Hoisted to module scope, not defined inline.
 *
 * Virtuoso remounts a component whose identity changes between renders, which
 * for `List` means the whole grid unmounts and its scroll position resets on
 * every parent render. Defining them once fixes the identity for the life of
 * the module.
 */
const GRID_COMPONENTS = {
  List: function GridList({
    style,
    children,
    ...props
  }: React.ComponentProps<"div">) {
    return (
      <div {...props} style={style} className={GRID_CLASS}>
        {children}
      </div>
    );
  },
  Item: function GridItem({ children, ...props }: React.ComponentProps<"div">) {
    // `h-full` so a short card stretches to its row, keeping the grid even.
    return (
      <div {...props} className="h-full">
        {children}
      </div>
    );
  },
} as const;

/** Shown under the grid while the next page is in flight. */
export function LoadingMore() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      Loading more…
    </div>
  );
}

export function EndOfResults({ total }: { total: number }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      {total === 1
        ? "That is the only match."
        : `You have seen all ${total} products.`}
    </p>
  );
}

export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={GRID_CLASS}>
      {Array.from({ length: count }, (_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  );
}

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-20 text-center">
      <span className="mb-5 flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <PackageSearch className="size-8" aria-hidden />
      </span>
      <h2 className="font-heading text-xl font-bold tracking-tight">
        Nothing matches those filters
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Try removing one of them, or widening the price range.
      </p>
      <Button
        onClick={onClear}
        className={cn(
          "mt-7 h-12 cursor-pointer rounded-field px-6 text-sm font-semibold",
        )}
      >
        Clear all filters
      </Button>
    </div>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-20 text-center">
      <h2 className="font-heading text-xl font-bold tracking-tight">
        We could not load the catalogue
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        This is usually a connection problem rather than something you did.
      </p>
      <Button
        variant="outline"
        onClick={onRetry}
        className="mt-7 h-12 cursor-pointer gap-2 rounded-field px-6 text-sm font-semibold"
      >
        <RefreshCw className="size-4" aria-hidden />
        Try again
      </Button>
    </div>
  );
}
