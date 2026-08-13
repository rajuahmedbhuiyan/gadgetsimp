"use client";

/**
 * Adding to the cart from a product card.
 *
 * `POST /cart/items` is always a batch, including the one-item case, and it
 * returns the whole cart rather than a delta. Quantity is the one thing the
 * server adjusts instead of rejecting — it caps to available stock — so
 * `adjustments` is surfaced as a toast; swallowing it means the shopper
 * silently gets fewer than they asked for.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, isApiError } from "@/lib/api/client";
import { cartCountKey } from "./use-cart-count";

export interface AddToCartInput {
  productId: string;
  /** Required for a VARIABLE product, refused for a SIMPLE one. */
  variantId?: string;
  quantity?: number;
}

interface Adjustment {
  message: string;
}

interface CartResponse {
  cart: unknown;
  adjustments: Adjustment[];
}

export function useAddToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddToCartInput) =>
      (
        await api<CartResponse>("/cart/items", {
          method: "POST",
          body: { items: [input] },
        })
      ).data,

    onSuccess: (data) => {
      if (data.adjustments?.length) {
        toast.warning(data.adjustments.map((a) => a.message).join(" "));
      } else {
        toast.success("Added to your cart");
      }

      // The badge and any open cart view both read from these.
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
}
