"use client";

/**
 * Reads and writes behind the admin orders screen.
 *
 * Paged rather than infinite, like the products table and for the same reason:
 * staff work a queue by page number, and "which page was that order on" is a
 * question an endless scroll cannot answer.
 *
 * Every mutation invalidates the whole `["admin", "orders"]` subtree rather
 * than patching one row. A status change is not a local edit - it can release
 * stock, mark the payment paid, and move the order out of the filter that is
 * currently on screen - so re-reading is the only way the list stays true.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  adminOrdersApi,
  type AdminOrderQuery,
  type ChangeStatusPayload,
  type UpdateOrderDetailsPayload,
} from "@/lib/api/admin/orders";
import { apiMessage } from "@/hooks/use-admin-products";

export const ORDERS_PAGE_SIZE = 20;

export const adminOrdersKey = (query: AdminOrderQuery) =>
  ["admin", "orders", query] as const;

export const adminOrderKey = (id: number) => ["admin", "order", id] as const;

export function useAdminOrders(query: AdminOrderQuery) {
  /*
   * Never served from cache.
   *
   * An order queue is the one listing where a stale row is actively
   * dangerous: two people work it at once, and a cached page can show an
   * order as PENDING that a colleague confirmed a minute ago - so the status
   * menu offers a move the API will then refuse. Every visit, every page and
   * every filter is a fresh read.
   *
   * `gcTime: 0` is what makes that true rather than merely likely: without
   * it the result stays in the cache after the screen unmounts and is handed
   * straight back on the next visit, before any refetch resolves.
   *
   * The cost is the table blanking to a skeleton on every page change instead
   * of holding the previous rows - `keepPreviousData` is exactly the "show
   * what we already have" behaviour being turned off here.
   */
  const result = useQuery({
    queryKey: adminOrdersKey(query),
    queryFn: () => adminOrdersApi.list(query),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    // A queue left open on a second monitor should not be yesterday's.
    refetchOnWindowFocus: true,
  });

  return {
    orders: result.data?.orders ?? [],
    meta: result.data?.meta ?? null,
    isLoading: result.isPending,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

export function useAdminOrder(id: number | undefined) {
  const result = useQuery({
    queryKey: adminOrderKey(id ?? 0),
    queryFn: () => adminOrdersApi.get(id!),
    enabled: Number.isFinite(id),
    // Same rule as the listing: an order is read to act on, never to skim.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  return {
    order: result.data ?? null,
    isLoading: id != null && result.isPending,
    isError: result.isError,
    error: result.error,
  };
}

/* ------------------------------- mutations ------------------------------- */

/** Both the row in any listing and the single-order cache, if either is held. */
function invalidateOrders(
  queryClient: ReturnType<typeof useQueryClient>,
  id?: number,
) {
  void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
  if (id != null) {
    void queryClient.invalidateQueries({ queryKey: adminOrderKey(id) });
  }
}

/**
 * Move an order along the workflow.
 *
 * Not optimistic, unlike the products table's feature switch. The server may
 * refuse the transition outright, and a legal one has side effects the client
 * cannot predict - releasing reserved stock, marking a cash-on-delivery order
 * paid - so showing the new state before it lands would be guessing at the
 * consequences as well as the outcome.
 */
export function useChangeOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: ChangeStatusPayload & { id: number }) =>
      adminOrdersApi.changeStatus(id, body),
    onSuccess: (order) => {
      toast.success(`Order ${order.orderNumber} marked ${order.status}`);
      invalidateOrders(queryClient, order.id);
    },
    onError: (error) => {
      // The API's own message is the useful one here: it names the legal
      // moves ("An order that is CONFIRMED can only move to: ...") rather
      // than just refusing.
      toast.error(apiMessage(error, "Could not change the status"));
    },
  });
}

/** Correct the delivery details. Refused by the API once an order is finished. */
export function useUpdateOrderDetails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: UpdateOrderDetailsPayload & { id: number }) =>
      adminOrdersApi.updateDetails(id, body),
    onSuccess: (order) => {
      toast.success("Delivery details updated");
      invalidateOrders(queryClient, order.id);
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not update the delivery details"));
    },
  });
}

export function useSoftDeleteOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => adminOrdersApi.softDelete(id),
    onSuccess: (order) => {
      // "Hidden", not "deleted" - the record and its numbers are kept, and
      // saying deleted would promise something the API did not do.
      toast.success(`Order ${order.orderNumber} hidden from the list`);
      invalidateOrders(queryClient, order.id);
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not delete the order"));
    },
  });
}

/**
 * Permanent delete.
 *
 * The one call in the panel with nothing behind it - no archive, no restore,
 * no record left to argue a refund from. The confirmation that guards it is
 * the last thing between a mis-click and that.
 */
export function useHardDeleteOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => adminOrdersApi.hardDelete(id),
    onSuccess: (result) => {
      toast.success(`Order ${result.orderNumber} permanently deleted`);
      // Nothing left to re-read for the single-order key, so it is dropped
      // rather than invalidated - refetching would only produce a 404.
      queryClient.removeQueries({ queryKey: adminOrderKey(result.id) });
      void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not permanently delete the order"));
    },
  });
}
