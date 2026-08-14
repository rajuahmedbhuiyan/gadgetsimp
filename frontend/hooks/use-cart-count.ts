"use client";

/**
 * The number on the cart badge.
 *
 * `GET /cart/count` exists precisely so this can run on every page without
 * pricing lines or checking stock. It is signed-in only, so the query is
 * disabled for guests, who are counted straight out of the local cart instead.
 */

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getGuestEntries,
  getServerGuestEntries,
  subscribeGuestCart,
} from "@/lib/cart/guest-cart";

interface CartCount {
  /** Distinct lines. A product in two variants counts twice. */
  itemCount: number;
  /** Units across every line - what the badge shows. */
  totalQuantity: number;
}

export const cartCountKey = ["cart", "count"] as const;

export function useCartCount() {
  const { isAuthenticated } = useAuth();

  // Signed out there is nothing to ask, so the badge counts the local lines.
  const guestEntries = useSyncExternalStore(
    subscribeGuestCart,
    getGuestEntries,
    getServerGuestEntries,
  );

  const { data, isPending } = useQuery({
    queryKey: cartCountKey,
    queryFn: async () => (await api<CartCount>("/cart/count")).data,
    enabled: isAuthenticated,
    // The badge is allowed to lag a little; every mutation invalidates this
    // key anyway, so the only stale reads are ones nothing changed.
    staleTime: 30_000,
  });

  if (!isAuthenticated) {
    return {
      count: guestEntries.reduce((sum, entry) => sum + entry.quantity, 0),
      itemCount: guestEntries.length,
      isLoading: false,
    };
  }

  return {
    count: data?.totalQuantity ?? 0,
    itemCount: data?.itemCount ?? 0,
    isLoading: isPending,
  };
}
