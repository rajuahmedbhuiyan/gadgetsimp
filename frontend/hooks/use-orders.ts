"use client";

/**
 * Reading the signed-in customer's orders.
 *
 * Both endpoints derive the owner from the token - there is no `userId` to
 * pass, and someone else's order answers 404 rather than 403, since order ids
 * are sequential and "exists but is not yours" is itself information.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { ordersApi, type OrderStatus } from "@/lib/api/orders";
import { useAuth } from "@/lib/auth/auth-context";

export const ordersKey = (
  status: OrderStatus | "ALL",
  page: number,
) => ["orders", { status, page }] as const;

export const orderKey = (id: number) => ["order", id] as const;

const PAGE_SIZE = 10;

export function useOrders({
  status = "ALL",
  page = 0,
}: {
  status?: OrderStatus | "ALL";
  page?: number;
} = {}) {
  const { isAuthenticated, status: session } = useAuth();

  const query = useQuery({
    queryKey: ordersKey(status, page),
    queryFn: async () =>
      ordersApi.filter({
        ...(status === "ALL" ? {} : { status }),
        sort: { field: "placedAt", direction: "desc" },
        pagination: { page, limit: PAGE_SIZE },
      }),
    enabled: isAuthenticated,
    // Keeps the previous page on screen while the next one loads, so paging
    // does not blank the list and jump the scroll position.
    placeholderData: keepPreviousData,
  });

  return {
    orders: query.data?.data.orders ?? [],
    meta: query.data?.meta ?? null,
    isLoading: session === "loading" || (isAuthenticated && query.isPending),
    isFetching: query.isFetching,
    isAuthenticated,
    error: query.error,
  };
}

export function useOrder(id: number) {
  const { isAuthenticated, status: session } = useAuth();

  const query = useQuery({
    queryKey: orderKey(id),
    queryFn: async () => (await ordersApi.get(id)).data.order,
    enabled: isAuthenticated && Number.isFinite(id),
    // An order in flight changes under the customer - a confirmation call, a
    // rider setting off - so a tab left open should not show yesterday's step.
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  return {
    order: query.data ?? null,
    isLoading: session === "loading" || (isAuthenticated && query.isPending),
    isAuthenticated,
    error: query.error,
  };
}
