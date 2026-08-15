"use client";

/**
 * Saved products.
 *
 * Signed-in only - there is no guest wishlist to fall back on, unlike the
 * cart. The list itself is deliberately plainer than `/shop`: it holds at most
 * 200 items, so there is no virtualisation and no filter sidebar, just the
 * three controls a list this size actually needs.
 *
 * Removal happens through the heart already on every card. There is no second
 * remove button, because two controls that do the same thing on the same card
 * is a question the shopper has to stop and answer.
 */

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Heart, PackageSearch, RefreshCw, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { EASE_BRAND } from "@/lib/motion";
import type { WishlistSortField } from "@/lib/api/wishlist";
import {
  useClearWishlist,
  useWishlistItems,
  type WishlistListQuery,
} from "@/hooks/use-wishlist-items";
import { container } from "@/components/home/section";
import { SignedOutPrompt } from "@/components/auth/signed-out-prompt";
import { ProductCard } from "@/components/product/product-card";
import { ProductCardSkeleton } from "@/components/product/product-card-skeleton";
import { ShopSearch } from "@/components/shop/shop-search";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Same column steps as the shop grid, minus the sidebar's step backwards. */
const GRID_CLASS =
  "grid grid-cols-1 gap-3 xs:grid-cols-2 min-[650px]:grid-cols-3 lg:gap-4 xl:grid-cols-4";

const SORTS: {
  value: string;
  label: string;
  short: string;
  field: WishlistSortField;
  direction: "asc" | "desc";
}[] = [
  // Newest first, because a wishlist is a list in the order you saved things.
  { value: "recent", label: "Recently saved", short: "Recent", field: "addedAt", direction: "desc" },
  { value: "oldest", label: "Oldest first", short: "Oldest", field: "addedAt", direction: "asc" },
  { value: "price-asc", label: "Price: low to high", short: "Price ↑", field: "price", direction: "asc" },
  { value: "price-desc", label: "Price: high to low", short: "Price ↓", field: "price", direction: "desc" },
  { value: "name-asc", label: "Name: A to Z", short: "A–Z", field: "name", direction: "asc" },
];

export function WishlistView() {
  const [search, setSearch] = useState("");
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState("recent");

  const chosen = SORTS.find((option) => option.value === sort) ?? SORTS[0]!;

  const query: WishlistListQuery = {
    search,
    inStock,
    sort: chosen.field,
    direction: chosen.direction,
  };

  const {
    items,
    total,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isError,
    refetch,
    isAuthenticated,
  } = useWishlistItems(query);

  const clear = useClearWishlist();

  if (!isLoading && !isAuthenticated) {
    return (
      <div className={`${container} py-6 lg:py-10`}>
        <SignedOutPrompt
          title="Sign in to see your wishlist"
          description="Saved items live on your account, so they are waiting for you on any device."
          next="/wishlist"
        />
      </div>
    );
  }

  // Distinguishes "you have saved nothing" from "nothing matches this search",
  // which need different words and a different way out.
  const filtered = search.length > 0 || inStock;
  const empty = !isLoading && items.length === 0;

  return (
    <div className={`${container} py-6 lg:py-10`}>
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 font-heading text-2xl font-bold tracking-tight lg:text-3xl">
            <Heart className="size-6 text-sale" aria-hidden />
            Wishlist
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isLoading
              ? "Loading your saved items…"
              : total === 0
                ? "Things you save will wait for you here."
                : `${total} ${total === 1 ? "product" : "products"} saved for later.`}
          </p>
        </div>

        <ShopSearch
          value={search}
          onChange={setSearch}
          className="w-full lg:w-72"
        />
      </header>

      {/* The controls are pointless with nothing saved at all, but must stay
          while a filter is the reason the grid is empty - otherwise there is
          no way to undo the filter that emptied it. */}
      {(!empty || filtered) && !isError ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <label
            htmlFor="wishlist-in-stock"
            className="flex cursor-pointer items-center gap-2.5 text-sm font-medium"
          >
            <Checkbox
              id="wishlist-in-stock"
              checked={inStock}
              onCheckedChange={(checked) => setInStock(checked === true)}
            />
            In stock only
          </label>

          <div className="flex items-center gap-2">
            <Select value={sort} onValueChange={(value) => setSort(String(value))}>
              <SelectTrigger
                aria-label="Sort saved items"
                className="data-[size=default]:h-11 w-auto cursor-pointer rounded-field text-sm min-[600px]:w-52"
              >
                <SelectValue>
                  {(value) => {
                    const option = SORTS.find((o) => o.value === String(value));
                    return (
                      <>
                        <span className="min-[600px]:hidden">{option?.short}</span>
                        <span className="hidden min-[600px]:inline">
                          Sort: {option?.label}
                        </span>
                      </>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="cursor-pointer text-sm"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {total > 0 ? <ClearAll onConfirm={() => clear.mutate()} /> : null}
          </div>
        </div>
      ) : null}

      {isError ? (
        <LoadFailed onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className={GRID_CLASS}>
          {Array.from({ length: 8 }, (_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      ) : empty ? (
        <Empty
          filtered={filtered}
          onClearFilters={() => {
            setSearch("");
            setInStock(false);
          }}
        />
      ) : (
        <>
          <ul className={GRID_CLASS}>
            {/*
              * `popLayout` so the cards after a removed one slide up into the
              * gap rather than snapping. Removal is the main thing that
              * happens on this page, and it is worth showing rather than
              * having a card blink out of existence.
              */}
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item, index) => (
                <motion.li
                  key={item.productId}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.22, ease: EASE_BRAND }}
                  className="relative h-full"
                >
                  <ProductCard
                    product={item}
                    priority={index < 4}
                    className={cn(!item.available && "opacity-60")}
                  />

                  {/*
                    * Withdrawn products stay on the list rather than being
                    * filtered away: the entry is still the shopper's, and
                    * hiding it would leave a row they can never remove. The
                    * card's own heart is how it goes.
                    */}
                  {!item.available ? (
                    <span className="pointer-events-none absolute inset-x-0 top-0 z-30 rounded-t-xl bg-foreground/85 py-1 text-center text-[11px] font-semibold text-background">
                      No longer available
                    </span>
                  ) : null}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {hasNextPage ? (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
                className="h-12 cursor-pointer rounded-field px-8 text-sm font-semibold"
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ClearAll({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            aria-label="Clear wishlist"
            className="h-11 shrink-0 cursor-pointer gap-2 rounded-field px-3.5 text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
          />
        }
      >
        <Trash2 className="size-4" aria-hidden />
        <span className="hidden min-[600px]:inline">Clear all</span>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear your wishlist?</AlertDialogTitle>
          <AlertDialogDescription>
            Every saved product will be removed. This cannot be undone, though
            you can save them again from the shop.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer rounded-field">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="cursor-pointer rounded-field bg-destructive text-white hover:bg-destructive/90"
          >
            Clear wishlist
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Empty({
  filtered,
  onClearFilters,
}: {
  filtered: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-20 text-center">
      <span className="mb-5 flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {filtered ? (
          <PackageSearch className="size-8" aria-hidden />
        ) : (
          <Heart className="size-8" aria-hidden />
        )}
      </span>

      <h2 className="font-heading text-xl font-bold tracking-tight lg:text-2xl">
        {filtered ? "Nothing matches that" : "Nothing saved yet"}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {filtered
          ? "Try a different search, or turn off the in-stock filter."
          : "Tap the heart on any product to keep it here while you decide."}
      </p>

      {filtered ? (
        <Button
          variant="outline"
          onClick={onClearFilters}
          className="mt-7 h-12 cursor-pointer rounded-field px-6 text-sm font-semibold"
        >
          Clear filters
        </Button>
      ) : (
        <Button
          className="mt-7 h-12 cursor-pointer rounded-field px-6 text-sm font-semibold"
          render={<Link href="/shop" />}
        >
          Browse the shop
        </Button>
      )}
    </div>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-20 text-center">
      <h2 className="font-heading text-xl font-bold tracking-tight">
        We could not load your wishlist
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
