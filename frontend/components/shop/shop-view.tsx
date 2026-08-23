"use client";

/**
 * The shop.
 *
 * Three pieces, all reading the same URL-backed filter state: a sidebar (a
 * drawer below `lg`), a toolbar, and a virtualised infinite grid. Nothing here
 * holds filter state of its own - see `use-shop-filters` for why the URL owns
 * it.
 *
 * The sidebar is `sticky` rather than a scroll container. A pane that scrolls
 * on its own next to a page that also scrolls gives two scrollbars and a
 * trackpad that does the wrong one; sticking it to the viewport keeps the
 * filters in reach while the page - and the grid's window virtualisation -
 * scrolls as one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { container } from "@/components/home/section";
import { countActiveFilters, hasAnyFilter } from "@/lib/shop/filters";
import type { RangeValue } from "@/lib/shop/filters";
import { useShopFilters } from "@/hooks/use-shop-filters";
import {
  useBrands,
  useFilterOptions,
  useShopCategories,
  useShopProducts,
} from "@/hooks/use-shop-data";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ActiveFilters } from "./active-filters";
import { FilterPanel } from "./filter-panel";
import {
  EndOfResults,
  LoadingMore,
  ProductGrid,
} from "./product-grid";
import { ScrollToTop } from "./scroll-to-top";
import { ShopSearch } from "./shop-search";
import { ShopToolbar } from "./shop-toolbar";

/**
 * Bounds for the price slider.
 *
 * Fixed rather than fetched: there is no endpoint for catalogue extremes, and
 * deriving them would cost two extra sorted queries on every page load to
 * move a slider's end stops. Wide enough to cover the catalogue with room
 * above it, and the numeric boxes accept anything inside the range regardless.
 */
const PRICE_BOUNDS = { min: 0, max: 10_000 };

export function ShopView() {
  const {
    filters,
    setCategories,
    setBrands,
    setSearch,
    setPrice,
    setInStock,
    setSort,
    setAttribute,
    toggleAttributeValue,
    clearFilters,
    clearAll,
  } = useShopFilters();

  const [drawerOpen, setDrawerOpen] = useState(false);

  const anchorRef = useRef<HTMLDivElement>(null);

  /*
   * True once the page has scrolled past the sticky bar's resting place.
   *
   * The site header is `relative` on this route, so that distance is however
   * tall the header happens to be - measured rather than assumed, since it
   * differs between breakpoints (113px at desktop, 130px on a phone).
   */
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    let frame = 0;

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const anchor = anchorRef.current;
        if (!anchor) return;
        setPinned(anchor.getBoundingClientRect().top <= 0);
      });
    };

    // A refresh can restore a scroll position, so settle up front rather than
    // waiting for the first scroll event.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const { categories } = useShopCategories();
  const { brands } = useBrands();
  const { groups, isLoading: loadingGroups } = useFilterOptions(
    filters.categories,
  );

  const {
    products,
    total,
    failed,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useShopProducts(filters);

  const toggleCategory = useCallback(
    (slug: string) => {
      setCategories(
        filters.categories.includes(slug)
          ? filters.categories.filter((item) => item !== slug)
          : [...filters.categories, slug],
      );
    },
    [filters.categories, setCategories],
  );

  const toggleBrand = useCallback(
    (slug: string) => {
      setBrands(
        filters.brands.includes(slug)
          ? filters.brands.filter((item) => item !== slug)
          : [...filters.brands, slug],
      );
    },
    [filters.brands, setBrands],
  );

  const setAttributeRange = useCallback(
    (key: string, range: RangeValue | null) => setAttribute(key, range),
    [setAttribute],
  );

  /*
   * A new filter means a new list, so the old scroll position is meaningless -
   * page 4 of "everything" is nowhere in "Chargers under ৳1000", and staying
   * put lands the shopper in the middle of results they have not seen the
   * start of. Virtuoso is already rebuilding from index 0; this moves the
   * window to match.
   *
   * The target is the sticky bar's resting position, not the top of the
   * document. Going to 0 would drag the site header back into view and push
   * the first row of results below the fold, so every filter change cost a
   * scroll to undo. Stopping here leaves the header scrolled away, the bar
   * pinned at the top, and the first product directly beneath it.
   *
   * Only ever scrolls up. Someone filtering from the top of the page has
   * nothing to correct, and nudging them down to hide the header would be a
   * change they did not ask for.
   */
  const scrollToResults = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const top = anchor.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
  }, []);

  /*
   * Keyed on the serialised filters rather than an equality check, and skipped
   * on the first render so arriving at a shared filtered link does not scroll.
   */
  const filterKey = JSON.stringify(filters);
  const lastFilterKey = useRef(filterKey);

  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    scrollToResults();
  }, [filterKey, scrollToResults]);

  const panel = (
    <FilterPanel
      filters={filters}
      categories={categories}
      brands={brands}
      groups={groups}
      priceBounds={PRICE_BOUNDS}
      loadingGroups={loadingGroups}
      onToggleCategory={toggleCategory}
      onToggleBrand={toggleBrand}
      onPrice={(range) => setPrice(range ?? {})}
      onInStock={setInStock}
      onToggleAttribute={toggleAttributeValue}
      onAttributeRange={setAttributeRange}
    />
  );

  const activeCount = countActiveFilters(filters);

  return (
    // Little padding above the heading - the bar carries its own `py-4`, and
    // stacking the container's on top of it left the title floating.
    <div className={`${container} pt-1 pb-6 lg:pt-3 lg:pb-10`}>
      {/* Marks where the sticky bar comes to rest, so a filter change can
          scroll to exactly that point instead of the top of the document. */}
      <div ref={anchorRef} aria-hidden />

      <header
        className={cn(
          // Bleeds to the container's padding edge so the grid scrolls under
          // a solid bar rather than past a floating card.
          "sticky top-0 z-30 -mx-4 mb-3 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:mb-5 lg:px-8",
          "flex flex-col gap-4 py-4 transition-[background-color,box-shadow,border-color] duration-300 lg:flex-row lg:items-end lg:justify-between",
          /*
           * Flush until it actually sticks.
           *
           * Painting the border and blur from the first frame made the bar
           * look detached the moment the page opened, before anything had
           * scrolled under it. `pinned` is true only once the page has moved
           * past this bar's resting position, which is also the moment it
           * stops being part of the page and starts covering it.
           */
          pinned
            ? "border-b bg-background/85 shadow-chrome supports-backdrop-filter:bg-background/70 supports-backdrop-filter:backdrop-blur-lg"
            : "border-b border-transparent bg-background",
        )}
      >
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight lg:text-3xl">
            {filters.search ? `Results for “${filters.search}”` : "Shop"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {filters.search
              ? "Refine with the filters to narrow this down."
              : "Every gadget we stock, filtered however you like."}
          </p>
        </div>

        <ShopSearch
          value={filters.search}
          onChange={setSearch}
          className="w-full lg:w-80"
        />
      </header>

      <div className="flex gap-8">
        {/* ------------------------------------------------ sidebar -- */}
        <aside className="hidden w-64 shrink-0 lg:block xl:w-72">
          {/* Clears the sticky bar above it, which measures 95px at this
              breakpoint - `top-24` left a single pixel of daylight, close
              enough that any change to the heading would have collided. */}
          <div className="sticky top-28">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <SlidersHorizontal className="size-4" aria-hidden />
                Filters
              </h2>
              {activeCount > 0 ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="cursor-pointer text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  Clear
                </button>
              ) : null}
            </div>

            {/* The only scroll container on the page, and only when the
                filters are taller than the viewport. */}
            <div className="max-h-[calc(100vh-9rem)] overflow-y-auto pr-2 pb-4">
              {panel}
            </div>
          </div>
        </aside>

        {/* --------------------------------------------------- grid -- */}
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-col gap-3 lg:mb-5 lg:gap-4">
            <ShopToolbar
              total={total}
              isLoading={isLoading}
              sort={filters.sort}
              onSortChange={setSort}
              activeCount={activeCount}
              onOpenFilters={() => setDrawerOpen(true)}
            />

            <ActiveFilters
              filters={filters}
              categories={categories}
              brands={brands}
              groups={groups}
              onToggleCategory={toggleCategory}
              onToggleBrand={toggleBrand}
              // The chip removes the filter, so `null` means "no range".
              onPrice={(range) => setPrice(range ?? {})}
              onInStock={setInStock}
              onToggleAttribute={toggleAttributeValue}
              onAttributeRange={setAttributeRange}
              onClearAll={clearFilters}
            />
          </div>

          <ProductGrid
            products={products}
            isLoading={isLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={Boolean(hasNextPage)}
            failed={failed}
            onEndReached={fetchNextPage}
            onRetry={refetch}
            onClear={hasAnyFilter(filters) ? clearAll : clearFilters}
          />

          {isFetchingNextPage ? <LoadingMore /> : null}
          {!isLoading && !hasNextPage && products.length > 0 ? (
            <EndOfResults total={total} />
          ) : null}
        </div>
      </div>

      {/* -------------------------------------------- mobile drawer -- */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="flex w-[min(22rem,88vw)]! flex-col gap-0 p-0"
        >
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="size-4" aria-hidden />
              Filters
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-5">{panel}</div>

          {/*
            * Only a Clear button, and only when there is something to clear.
            *
            * The grid behind the drawer updates as each box is ticked, so
            * there was never anything to confirm - the sheet's own close
            * control dismisses it, and a footer with nothing in it is just a
            * border eating room the filter list wants.
            */}
          {activeCount > 0 ? (
            <div className="border-t p-4">
              <Button
                variant="outline"
                onClick={clearFilters}
                className="h-12 w-full cursor-pointer rounded-field text-sm font-semibold"
              >
                Clear all filters
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Takes the corner the WhatsApp button occupies elsewhere - the shop
          hides that one, so the two never overlap. */}
      <ScrollToTop />
    </div>
  );
}
