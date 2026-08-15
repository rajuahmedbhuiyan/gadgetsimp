"use client";

/**
 * The saved-items listing.
 *
 * Separate from `use-wishlist`, which owns the id set behind every heart on
 * every grid in the shop. That one answers "is this saved"; this one answers
 * "what have I saved", and only the wishlist page needs it.
 *
 * Both live under the `["wishlist"]` key prefix so a toggle anywhere in the
 * app invalidates the pair together - otherwise unticking a heart on this page
 * would empty the heart but leave the card sitting in the grid.
 */

import { useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { isApiError } from "@/lib/api/client";
import {
  wishlistApi,
  type WishlistItem,
  type WishlistSortField,
} from "@/lib/api/wishlist";
import { useAuth } from "@/lib/auth/auth-context";

/** A wishlist tops out at 200 server-side, so this is at most a few pages. */
export const WISHLIST_PAGE_SIZE = 24;

export interface WishlistListQuery {
  search: string;
  inStock: boolean;
  sort: WishlistSortField;
  direction: "asc" | "desc";
}

export const wishlistItemsKey = (query: WishlistListQuery) =>
  ["wishlist", "items", query] as const;

export function useWishlistItems(query: WishlistListQuery) {
  const { isAuthenticated, status } = useAuth();

  const infinite = useInfiniteQuery({
    queryKey: wishlistItemsKey(query),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      wishlistApi.filter({
        ...(query.search ? { search: query.search } : {}),
        ...(query.inStock ? { inStock: true } : {}),
        sort: { field: query.sort, direction: query.direction },
        pagination: { page: pageParam, limit: WISHLIST_PAGE_SIZE },
      }),
    getNextPageParam: (lastPage) =>
      lastPage.meta?.hasNextPage ? lastPage.meta.page + 1 : undefined,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  /*
   * De-duplicated by product id: removing an item shifts everything after it
   * back one slot, so a page fetched afterwards can repeat a card that is
   * already on screen - and two cards with the same React key is a crash
   * rather than a cosmetic problem.
   */
  const items = useMemo(() => {
    const seen = new Set<string>();
    const flat: WishlistItem[] = [];

    for (const page of infinite.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.productId)) continue;
        seen.add(item.productId);
        flat.push(item);
      }
    }

    return flat;
  }, [infinite.data]);

  return {
    items,
    total: infinite.data?.pages[0]?.meta?.total ?? 0,
    isLoading: status === "loading" || (isAuthenticated && infinite.isPending),
    isFetchingNextPage: infinite.isFetchingNextPage,
    hasNextPage: Boolean(infinite.hasNextPage),
    fetchNextPage: infinite.fetchNextPage,
    isError: infinite.isError,
    refetch: infinite.refetch,
    isAuthenticated,
  };
}

/**
 * Emptying the whole list.
 *
 * No optimistic update: unlike a toggle this is not self-correcting, and
 * showing an empty page that then repopulates because the request failed is
 * worse than a moment's wait. The confirmation dialog already covers the
 * "did I mean that" question.
 */
export function useClearWishlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => wishlistApi.clear(),
    onSuccess: () => {
      toast.success("Wishlist cleared");
      void queryClient.invalidateQueries({ queryKey: ["wishlist"] });
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not clear your wishlist",
      );
    },
  });
}
