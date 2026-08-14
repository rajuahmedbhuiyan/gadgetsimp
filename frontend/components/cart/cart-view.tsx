"use client";

/**
 * The cart page body.
 *
 * A client component in full, because the cart is per-session data behind an
 * access token - there is nothing here the server render could know.
 *
 * Unavailable lines are listed with everything else, in place, rather than
 * pushed into a separate group: they keep their position so the shopper
 * recognises the row, and the page offers a one-tap way to clear all of them
 * at once since that is the only thing standing between them and checkout.
 */

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Trash2, TriangleAlert } from "lucide-react";

import { useCart } from "@/hooks/use-cart";
import { CartLineRow } from "./cart-line-row";
import { CartSummary } from "./cart-summary";
import { CartEmpty, CartSkeleton } from "./cart-states";

export function CartView() {
  const {
    cart,
    isLoading,
    setQuantity,
    pendingQuantityFor,
    removeItems,
    removingIds,
    clear,
    isClearing,
  } = useCart();

  const unavailableIds = useMemo(
    () =>
      cart.items
        .filter((line) => !line.availability.purchasable)
        .map((line) => line.id),
    [cart.items],
  );

  if (isLoading) return <CartSkeleton />;
  // No sign-in wall: a guest cart lives in `localStorage` and checks out
  // through the public order endpoint.
  if (cart.items.length === 0) return <CartEmpty />;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.7fr_1fr]">
      <div className="flex flex-col gap-4">
        {unavailableIds.length > 0 ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3"
          >
            <p className="flex items-center gap-2 text-sm">
              <TriangleAlert
                className="size-4 shrink-0 text-destructive"
                aria-hidden
              />
              {unavailableIds.length === 1
                ? "One item is no longer available."
                : `${unavailableIds.length} items are no longer available.`}
            </p>
            <button
              type="button"
              onClick={() => removeItems(unavailableIds)}
              className="cursor-pointer rounded-field px-2 py-1 text-sm font-semibold text-destructive underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Remove {unavailableIds.length === 1 ? "it" : "them"}
            </button>
          </div>
        ) : null}

        <div className="rounded-xl border bg-card p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold">
              {cart.summary.itemCount}{" "}
              {cart.summary.itemCount === 1 ? "item" : "items"} in your cart
            </h2>

            <button
              type="button"
              onClick={() => clear()}
              disabled={isClearing}
              className="flex cursor-pointer items-center gap-1.5 rounded-field px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
            >
              {isClearing ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-3.5" aria-hidden />
              )}
              Clear cart
            </button>
          </div>

          <ul className="divide-y">
            {cart.items.map((line) => (
              <CartLineRow
                key={line.id}
                line={line}
                busy={
                  pendingQuantityFor === line.id ||
                  removingIds?.includes(line.id) ||
                  isClearing
                }
                onQuantityChange={(quantity) =>
                  setQuantity({ itemId: line.id, quantity })
                }
                onRemove={() => removeItems([line.id])}
              />
            ))}
          </ul>
        </div>

        <Link
          href="/shop"
          className="group inline-flex items-center gap-1.5 self-start rounded-field px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-brand-foreground dark:hover:text-brand"
        >
          <ArrowLeft
            className="size-4 transition-transform duration-200 group-hover:-translate-x-1"
            aria-hidden
          />
          Continue shopping
        </Link>
      </div>

      {/* Follows the list on a long cart, so the total and the checkout button
          are never scrolled off. */}
      <aside className="lg:sticky lg:top-40 lg:self-start">
        <CartSummary summary={cart.summary} />
      </aside>
    </div>
  );
}
