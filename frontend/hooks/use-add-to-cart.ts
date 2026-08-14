"use client";

/**
 * Adding to the cart, signed in or not.
 *
 * Signed in, `POST /cart/items` is always a batch - including the one-item
 * case - and returns the whole cart rather than a delta. Quantity is the one
 * thing the server adjusts instead of rejecting, so `adjustments` is surfaced
 * as a toast; swallowing it means the shopper silently gets fewer than they
 * asked for.
 *
 * Signed out there is no server cart to post to, so the line is written to
 * `localStorage`. That needs more than ids: with no API to ask, the caller
 * hands over the name, price and image it already has on screen. Those are for
 * display only - `POST /orders` re-prices every line and refuses the whole
 * order if anything moved.
 */

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, isApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-context";
import { addGuestEntry, type GuestEntry } from "@/lib/cart/guest-cart";
import { cartCountKey } from "./use-cart-count";

export interface AddToCartInput {
  productId: string;
  /** Required for a VARIABLE product, refused for a SIMPLE one. */
  variantId?: string;
  quantity?: number;
  /** Only read when signed out - what to show without an API to ask. */
  snapshot: Omit<GuestEntry, "addedAt" | "productId" | "variantId" | "quantity">;
}

interface Adjustment {
  message: string;
}

interface CartResponse {
  cart: unknown;
  adjustments: Adjustment[];
}

/** How long the button says "Added" before going back to its normal label. */
const SUCCESS_RESET_MS = 2000;

export function useAddToCart() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const mutation = useMutation({
    mutationFn: async ({ snapshot, ...input }: AddToCartInput) => {
      if (!isAuthenticated) {
        addGuestEntry({
          productId: input.productId,
          variantId: input.variantId ?? null,
          quantity: input.quantity ?? 1,
          ...snapshot,
        });
        return null;
      }

      return (
        await api<CartResponse>("/cart/items", {
          method: "POST",
          body: { items: [input] },
        })
      ).data;
    },

    onSuccess: (data) => {
      if (data?.adjustments?.length) {
        toast.warning(data.adjustments.map((a) => a.message).join(" "));
      } else {
        toast.success("Added to your cart");
      }

      // No-ops for a guest - those keys hold nothing - but harmless, and it
      // keeps this path free of a second branch.
      queryClient.invalidateQueries({ queryKey: cartCountKey });
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },

    onError: (error) => {
      if (!isApiError(error)) {
        toast.error("Could not add this to your cart");
        return;
      }

      // A 422 names the offending position; with a single item the field
      // errors are more specific than the summary message.
      const detail = error.errors[0]?.message;
      toast.error(detail ?? error.message);
    },
  });

  /*
   * "Added" is a confirmation, not a state.
   *
   * React Query keeps `isSuccess` true until something resets it, so the
   * button sat on its tick indefinitely - which reads as "this is done" rather
   * than "that worked", and leaves no obvious way to add a second one. Two
   * seconds is long enough to be seen and short enough that the button is
   * ready again before anyone reaches for it.
   *
   * Handled here rather than at each call site so every add button behaves the
   * same way. `reset` is stable, and the timer is cleared on unmount.
   */
  const { isSuccess, reset } = mutation;
  useEffect(() => {
    if (!isSuccess) return;
    const timer = setTimeout(reset, SUCCESS_RESET_MS);
    return () => clearTimeout(timer);
  }, [isSuccess, reset]);

  return mutation;
}
