"use client";

/**
 * Reads the stashed confirmation and decides what to show.
 *
 * Session storage is only readable after mount, so there is a beat where
 * nothing is known - rendering the fallback during it would flash "we could
 * not find your order" at someone whose order was just placed. Hence three
 * states rather than two.
 *
 * The cart query is invalidated on arrival: placing an order empties the
 * server-side cart, and the header badge would otherwise keep showing the
 * count until the next navigation.
 */

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { PackageSearch } from "lucide-react";

import { useHydrated } from "@/hooks/use-hydrated";
import { cartKey } from "@/hooks/use-cart";
import { cartCountKey } from "@/hooks/use-cart-count";
import { readConfirmation, type Confirmation } from "@/lib/checkout/confirmation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderSuccess } from "./order-success";

export function OrderSuccessView() {
  const queryClient = useQueryClient();

  /*
   * Session storage does not exist on the server, so the read waits for
   * hydration - and is a plain memo rather than state set from an effect,
   * which would cost an extra render and trip the cascading-render rule.
   */
  const hydrated = useHydrated();
  const confirmation: Confirmation | null = useMemo(
    () => (hydrated ? readConfirmation() : null),
    [hydrated],
  );

  // Placing the order emptied the server-side cart; drop both cached views so
  // the header badge does not keep showing the old count. An effect is right
  // here - this is synchronising an external store, not deriving state.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: cartKey });
    queryClient.invalidateQueries({ queryKey: cartCountKey });
  }, [queryClient]);

  if (!hydrated) {
    return (
      // Matches the real page panel for panel: tick, order number, items,
      // delivery details, actions.
      // Mirrors the real page: one compact band, then the two-column grid.
      <div className="mx-auto w-full max-w-5xl">
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
          <Skeleton className="h-80 w-full rounded-xl" />
          <div className="flex flex-col gap-6">
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!confirmation) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-dashed px-6 py-20 text-center">
        <span className="mb-5 flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <PackageSearch className="size-8" aria-hidden />
        </span>
        <h1 className="font-heading text-xl font-bold tracking-tight lg:text-2xl">
          No recent order to show
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {/* The receipt lives in this tab only, so a new tab or a later visit
              lands here even though the order is perfectly fine. */}
          This confirmation is only kept for the current tab. If you just placed
          an order it is safe - you will find it under your orders.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button
            className="h-12 cursor-pointer rounded-field px-6 text-sm font-semibold"
            render={<Link href="/orders" />}
          >
            View my orders
          </Button>
          <Button
            variant="outline"
            className="h-12 cursor-pointer rounded-field px-6 text-sm font-semibold"
            render={<Link href="/shop" />}
          >
            Continue shopping
          </Button>
        </div>
      </div>
    );
  }

  return <OrderSuccess confirmation={confirmation} />;
}
