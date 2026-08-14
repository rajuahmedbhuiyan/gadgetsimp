"use client";

/**
 * The cart, and everything that writes to it.
 *
 * Every mutation returns the whole cart, so each one seeds the query cache
 * from its own response rather than triggering a refetch - the screen is
 * already holding the authoritative answer by the time the request resolves.
 *
 * Quantity changes are optimistic because a stepper that waits a round trip
 * per tap feels broken; removals are not, because a row vanishing and coming
 * back is worse than a row that takes 200ms to go.
 */

import { useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { cartApi, type Cart, type CartResponse, EMPTY_CART } from "@/lib/api/cart";
import { isApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/auth/errors";
import { useAuth } from "@/lib/auth/auth-context";
import {
  clearGuestCart,
  getGuestEntries,
  getServerGuestEntries,
  removeGuestEntries,
  setGuestQuantity,
  subscribeGuestCart,
  toCart,
} from "@/lib/cart/guest-cart";
import { cartCountKey } from "./use-cart-count";

/**
 * The guest cart, as a `Cart`.
 *
 * Split out so `useCart` can read it unconditionally - hooks cannot be called
 * behind an `if`, and the signed-in branch has to be able to ignore it.
 */
function useGuestCart(): Cart {
  const entries = useSyncExternalStore(
    subscribeGuestCart,
    getGuestEntries,
    getServerGuestEntries,
  );
  return toCart(entries);
}

export const cartKey = ["cart"] as const;

export function useCart() {
  const { isAuthenticated, status } = useAuth();
  const queryClient = useQueryClient();
  const guestCart = useGuestCart();

  const query = useQuery({
    queryKey: cartKey,
    // The cache holds the `Cart`, not the `{ cart, adjustments }` envelope, so
    // every writer - this and each mutation - stores the same shape.
    queryFn: async () => (await cartApi.get()).data.cart,
    enabled: isAuthenticated,
    // Prices and stock are checked live on every read, so a cached cart from
    // two minutes ago can disagree with what checkout will accept.
    staleTime: 0,
  });

  /**
   * Apply a server response to the cache.
   *
   * `adjustments` is surfaced here rather than at each call site so no
   * mutation can forget: it is the one case where the server changed the
   * request instead of refusing it.
   */
  function absorb(response: CartResponse) {
    queryClient.setQueryData<Cart>(cartKey, response.cart);
    queryClient.setQueryData(cartCountKey, {
      itemCount: response.cart.summary.itemCount,
      totalQuantity: response.cart.summary.totalQuantity,
    });

    if (response.adjustments?.length) {
      toast.warning(response.adjustments.map((a) => a.message).join(" "));
    }
  }

  function onFailure(error: unknown, previous?: Cart) {
    if (previous) queryClient.setQueryData(cartKey, previous);

    // A concurrent write lost a race; the cart is fine, the attempt is not.
    if (isApiError(error) && error.statusCode === 409) {
      toast.error("The cart changed while you were editing. Try again.");
    } else {
      toast.error(errorMessage(error));
    }

    queryClient.invalidateQueries({ queryKey: cartKey });
  }

  const setQuantity = useMutation({
    mutationFn: async ({
      itemId,
      quantity,
    }: {
      itemId: string;
      quantity: number;
    }) => (await cartApi.updateItems([{ itemId, quantity }])).data,

    onMutate: async ({ itemId, quantity }) => {
      await queryClient.cancelQueries({ queryKey: cartKey });
      const previous = queryClient.getQueryData<Cart>(cartKey);

      // Line totals only - the summary is left to the server, which counts
      // purchasable lines only and would be guessed wrong here.
      queryClient.setQueryData<Cart>(cartKey, (cart) =>
        cart
          ? {
              ...cart,
              items: cart.items
                .map((line) =>
                  line.id === itemId
                    ? {
                        ...line,
                        quantity,
                        lineTotal: (line.unitPrice ?? 0) * quantity,
                      }
                    : line,
                )
                // 0 is a removal, so the row goes straight away.
                .filter((line) => line.quantity > 0),
            }
          : cart,
      );

      return { previous };
    },

    onSuccess: absorb,
    onError: (error, _input, context) => onFailure(error, context?.previous),
  });

  const removeItems = useMutation({
    mutationFn: async (itemIds: string[]) =>
      (await cartApi.removeItems(itemIds)).data,
    onSuccess: (response) => {
      absorb(response);
      toast.success("Removed from your cart");
    },
    onError: (error) => onFailure(error),
  });

  const clear = useMutation({
    mutationFn: async () => (await cartApi.clear()).data,
    onSuccess: (response) => {
      absorb(response);
      toast.success("Your cart is empty");
    },
    onError: (error) => onFailure(error),
  });

  /*
   * Signed out, every write goes to `localStorage` instead of the API, and
   * nothing is ever in flight - so the pending flags are all false and the
   * callers need no branch of their own.
   */
  if (!isAuthenticated) {
    return {
      cart: guestCart,
      // Only the session lookup can be pending; the local cart is synchronous.
      isLoading: status === "loading",
      isAuthenticated: false,
      error: null,
      refetch: () => Promise.resolve(),

      setQuantity: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
        setGuestQuantity(itemId, quantity),
      pendingQuantityFor: undefined,

      removeItems: (itemIds: string[]) => {
        removeGuestEntries(itemIds);
        toast.success("Removed from your cart");
      },
      isRemoving: false,
      removingIds: undefined,

      clear: () => {
        clearGuestCart();
        toast.success("Your cart is empty");
      },
      isClearing: false,
    };
  }

  return {
    cart: query.data ?? EMPTY_CART,
    /** Distinguishes "still resolving the session" from "signed out". */
    isLoading: status === "loading" || query.isPending,
    isAuthenticated: true,
    error: query.error,
    refetch: query.refetch,

    setQuantity: setQuantity.mutate,
    pendingQuantityFor: setQuantity.isPending
      ? setQuantity.variables?.itemId
      : undefined,

    removeItems: removeItems.mutate,
    isRemoving: removeItems.isPending,
    removingIds: removeItems.isPending ? removeItems.variables : undefined,

    clear: clear.mutate,
    isClearing: clear.isPending,
  };
}
