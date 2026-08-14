"use client";

/**
 * Reads behind the shop page.
 *
 * The grid is an infinite query rather than a paged one: the shopper scrolls,
 * so pages accumulate instead of replacing each other. Its key is the whole
 * filter state, which means changing any filter starts a fresh list rather
 * than appending different products onto the old one.
 */

import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  getBrands,
  getCategories,
  getFilterOptions,
  getProducts,
  type ProductCard,
} from "@/lib/api/shop";
import { toShopQuery, type ShopFilterState } from "@/lib/shop/filters";

/** Big enough that the first screen is full, small enough to stay quick. */
export const PAGE_SIZE = 20;

export function useShopProducts(filters: ShopFilterState) {
  const query = useInfiniteQuery({
    queryKey: ["shop", "products", filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getProducts(toShopQuery(filters, pageParam, PAGE_SIZE)),
    getNextPageParam: (lastPage) => {
      const meta = lastPage.meta;
      // `meta` is null when the call failed. Returning undefined stops the
      // scroll from firing the same broken request on every wheel event.
      if (!meta?.hasNextPage) return undefined;
      return meta.page + 1;
    },
    staleTime: 60_000,
  });

  /*
   * Flattened once per fetch rather than on every render, and de-duplicated
   * by id: the catalog can shift between page requests - a product going out
   * of stock reorders the list - and a repeat would otherwise appear twice and
   * collide on its React key.
   */
  const products = useMemo(() => {
    const seen = new Set<string>();
    const flat: ProductCard[] = [];

    for (const page of query.data?.pages ?? []) {
      for (const product of page.items) {
        if (seen.has(product.id)) continue;
        seen.add(product.id);
        flat.push(product);
      }
    }

    return flat;
  }, [query.data]);

  const total = query.data?.pages[0]?.meta?.total ?? 0;

  /** The first page failed, so there is nothing on screen to keep. */
  const failed =
    query.isError ||
    (query.isSuccess && query.data.pages[0]?.meta === null);

  return {
    products,
    total,
    failed,
    isLoading: query.isPending,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}

/**
 * The attribute filters for the selected category.
 *
 * Only fetched with exactly one category selected. The endpoint is keyed by a
 * single slug, and merging the option sets of several categories would offer
 * filters that no product in the result can satisfy.
 */
export function useFilterOptions(categories: string[]) {
  const slug = categories.length === 1 ? categories[0]! : null;

  const query = useQuery({
    queryKey: ["shop", "filter-options", slug],
    queryFn: () => getFilterOptions(slug!),
    enabled: slug !== null,
    // The sidebar for a category changes only when the catalog does.
    staleTime: 5 * 60_000,
  });

  return {
    groups: query.data ?? [],
    isLoading: slug !== null && query.isPending,
  };
}

export function useShopCategories() {
  const query = useQuery({
    queryKey: ["shop", "categories"],
    // `forceCategories` off: a category with nothing to sell is a dead end.
    queryFn: () => getCategories({ pagination: { page: 0, limit: 100 } }),
    staleTime: 5 * 60_000,
  });

  return { categories: query.data?.items ?? [], isLoading: query.isPending };
}

export function useBrands() {
  const query = useQuery({
    queryKey: ["shop", "brands"],
    queryFn: () => getBrands(),
    staleTime: 5 * 60_000,
  });

  return { brands: query.data ?? [], isLoading: query.isPending };
}
