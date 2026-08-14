"use client";

/**
 * Moves a guest's cart onto their account the moment they sign in.
 *
 * Without this, filling a cart and then logging in loses it - the server cart
 * replaces the local one and the shopper watches their basket empty, which is
 * the worst possible moment to lose their trust.
 *
 * `POST /cart/items` merges by design: adding something already there raises
 * that line rather than duplicating it, and the same product and variant sent
 * twice in one batch is summed. So this hands over everything in one call and
 * lets the server reconcile.
 *
 * Mounted in both layouts (signing in happens under the auth one, everything
 * after under the storefront one) and renders nothing.
 */

import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { cartApi } from "@/lib/api/cart";
import { useAuth } from "@/lib/auth/auth-context";
import { clearGuestCart, getGuestEntries } from "@/lib/cart/guest-cart";
import { cartKey } from "@/hooks/use-cart";
import { cartCountKey } from "@/hooks/use-cart-count";

/**
 * Module scope, not a ref.
 *
 * Signing in on `/login` navigates immediately, so this component unmounts and
 * a fresh one mounts under the storefront layout - a ref would be back to
 * `false` and the merge would run a second time, doubling every quantity the
 * first run already sent. Holding the promise here also means two mounts
 * racing share one request rather than firing two.
 */
let inFlight: Promise<void> | null = null;

async function mergeGuestCart(queryClient: QueryClient) {
  const entries = getGuestEntries();
  if (entries.length === 0) return;

  try {
    await cartApi.addItems(
      // The API caps a batch at 50; a local cart should never approach that,
      // but sending 51 would fail the whole merge.
      entries.slice(0, 50).map((entry) => ({
        productId: entry.productId,
        ...(entry.variantId ? { variantId: entry.variantId } : {}),
        quantity: entry.quantity,
      })),
    );

    /*
     * Cleared unconditionally - not behind an "is this component still
     * mounted" check. The server has the lines; whether the component that
     * asked for it survived the navigation is irrelevant, and leaving them
     * behind is what lets a later mount send them again.
     */
    clearGuestCart();

    queryClient.invalidateQueries({ queryKey: cartKey });
    queryClient.invalidateQueries({ queryKey: cartCountKey });

    toast.success(
      entries.length === 1
        ? "Your item moved to your account cart"
        : `Your ${entries.length} items moved to your account cart`,
    );
  } catch {
    /*
     * Most likely a line that has since sold out, which fails the whole batch.
     * The local cart is left intact so the shopper can still see and fix it,
     * and `inFlight` is released so the next sign-in can try again.
     */
    toast.error(
      "Some items could not be moved to your account. They are still in your cart.",
    );
  }
}

export function GuestCartMerge() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) {
      // Signed out again: let the next sign-in merge whatever is collected
      // between now and then.
      inFlight = null;
      return;
    }

    inFlight ??= mergeGuestCart(queryClient).finally(() => {
      inFlight = null;
    });
  }, [isAuthenticated, queryClient]);

  return null;
}
