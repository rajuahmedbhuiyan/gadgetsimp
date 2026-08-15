"use client";

/**
 * Reads and writes behind the admin products screens.
 *
 * Paged rather than infinite, unlike the storefront grid: staff work through a
 * table by page number, and "which page was that product on" is a question an
 * endless scroll cannot answer.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { isApiError } from "@/lib/api/client";
import {
  adminProductsApi,
  adminTaxonomyApi,
  leavesOf,
  type AdminProductQuery,
  type ProductWritePayload,
} from "@/lib/api/admin/products";

export const PRODUCTS_PAGE_SIZE = 20;

export const adminProductsKey = (query: AdminProductQuery) =>
  ["admin", "products", query] as const;

export const adminProductKey = (id: string) =>
  ["admin", "product", id] as const;

export function useAdminProducts(query: AdminProductQuery) {
  const result = useQuery({
    queryKey: adminProductsKey(query),
    queryFn: () => adminProductsApi.list(query),
    // Keeps the current page on screen while the next one loads, so paging
    // does not blank the table and jump the scroll position.
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  return {
    products: result.data?.products ?? [],
    meta: result.data?.meta ?? null,
    isLoading: result.isPending,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

export function useAdminProduct(id: string | undefined) {
  const result = useQuery({
    queryKey: adminProductKey(id ?? ""),
    queryFn: () => adminProductsApi.get(id!),
    enabled: Boolean(id),
  });

  return {
    product: result.data ?? null,
    isLoading: Boolean(id) && result.isPending,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

export function useTaxonomy() {
  const categories = useQuery({
    queryKey: ["admin", "category-tree"],
    queryFn: () => adminTaxonomyApi.categoryTree(),
    staleTime: 5 * 60_000,
  });

  const brands = useQuery({
    queryKey: ["admin", "brands"],
    queryFn: () => adminTaxonomyApi.brands(),
    staleTime: 5 * 60_000,
  });

  const tree = categories.data ?? [];

  return {
    tree,
    /** Only the leaves are selectable; each knows its own ancestry. */
    leaves: leavesOf(tree),
    brands: brands.data ?? [],
    isLoading: categories.isPending || brands.isPending,
  };
}

/* ------------------------------- mutations ------------------------------- */

/** Surfaces the API's own message, and its per-field errors where there are any. */
export function apiMessage(error: unknown, fallback: string) {
  if (!isApiError(error)) return fallback;

  const fields = Object.entries(error.fieldErrors);
  if (fields.length > 0) {
    return fields.map(([field, message]) => `${field}: ${message}`).join(" · ");
  }

  return error.message || fallback;
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ProductWritePayload) => adminProductsApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not create the product"));
    },
  });
}

/**
 * One panel's save.
 *
 * Takes the call itself rather than a section name, so each panel keeps its
 * own payload type and a typo cannot route a pricing body at the stock
 * endpoint.
 */
export function useProductPatch<TBody>(
  id: string,
  call: (id: string, body: TBody) => Promise<unknown>,
  label: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: TBody) => call(id, body),
    onSuccess: () => {
      toast.success(`${label} saved`);
      // Both the record and any table showing it.
      void queryClient.invalidateQueries({ queryKey: adminProductKey(id) });
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
    onError: (error) => {
      toast.error(apiMessage(error, `Could not save ${label.toLowerCase()}`));
    },
  });
}

/**
 * The table's feature toggle.
 *
 * Optimistic, because a switch that waits for a round trip before moving reads
 * as broken - and it is one boolean, so rolling it back is exact.
 */
export function useToggleFeatured(query: AdminProductQuery) {
  const queryClient = useQueryClient();
  const key = adminProductsKey(query);

  return useMutation({
    mutationFn: ({ id, featured }: { id: string; featured: boolean }) =>
      adminProductsApi.patch.featured(id, featured),

    onMutate: async ({ id, featured }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);

      queryClient.setQueryData(key, (current: unknown) => {
        const page = current as
          | { products: { id: string; featured: boolean }[] }
          | undefined;
        if (!page) return current;

        return {
          ...page,
          products: page.products.map((product) =>
            product.id === id ? { ...product, featured } : product,
          ),
        };
      });

      return { previous };
    },

    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(apiMessage(error, "Could not update the product"));
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminProductsApi.remove(id),
    onSuccess: () => {
      // "Archived", not "deleted" - the API keeps the record and hides it, so
      // saying "deleted" would promise something it did not do.
      toast.success("Product archived");
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not archive the product"));
    },
  });
}
