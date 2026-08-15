"use client";

/**
 * Wishlist state for a grid of hearts.
 *
 * One `GET /wishlist/ids` fills every heart on the page — asking the paginated
 * listing instead would ship a hundred product cards to render a hundred
 * booleans. Toggling goes through `POST /wishlist/toggle` rather than
 * add/remove: the server decides the direction from its own state, so a double
 * tap is self-correcting even when this cache is stale.
 */

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, isApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-context";

interface WishlistIds {
  productIds: string[];
  total: number;
}

interface ToggleResult {
  productId: string;
  inWishlist: boolean;
  total: number;
}

export const wishlistIdsKey = ["wishlist", "ids"] as const;

export function useWishlist() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: wishlistIdsKey,
    queryFn: async () => (await api<WishlistIds>("/wishlist/ids")).data,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const saved = useMemo(
    () => new Set(data?.productIds ?? []),
    [data?.productIds],
  );

  const { mutate, isPending } = useMutation({
    mutationFn: async (productId: string) =>
      (
        await api<ToggleResult>("/wishlist/toggle", {
          method: "POST",
          body: { productId },
        })
      ).data,

    // Fill the heart on tap. The server is the authority, but waiting a round
    // trip to acknowledge a tap is what makes a grid feel broken.
    onMutate: async (productId) => {
      await queryClient.cancelQueries({ queryKey: wishlistIdsKey });
      const previous = queryClient.getQueryData<WishlistIds>(wishlistIdsKey);

      queryClient.setQueryData<WishlistIds>(wishlistIdsKey, (current) => {
        const ids = current?.productIds ?? [];
        const next = ids.includes(productId)
          ? ids.filter((id) => id !== productId)
          : [productId, ...ids];
        return { productIds: next, total: next.length };
      });

      return { previous };
    },

    onError: (error, _productId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(wishlistIdsKey, context.previous);
      }
      toast.error(
        isApiError(error) ? error.message : "Could not update your wishlist",
      );
    },

    onSuccess: (result) => {
      toast.success(
        result.inWishlist ? "Saved to wishlist" : "Removed from wishlist",
      );
    },

    /*
     * Reconcile against the server either way - the optimistic guess and the
     * real answer can disagree if another tab changed the list.
     *
     * The whole `["wishlist"]` tree, not just the ids: the saved-items listing
     * lives under the same prefix, and unticking a heart on the wishlist page
     * has to take the card with it rather than leaving an empty heart on a row
     * that is no longer saved.
     */
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
    },
  });

  return {
    isSaved: (productId: string) => saved.has(productId),
    toggle: mutate,
    isPending,
    /** Guests get a sign-in prompt rather than a failing request. */
    canSave: isAuthenticated,
  };
}
