"use client";

/**
 * The number on the cart badge.
 *
 * `GET /cart/count` exists precisely so this can run on every page without
 * pricing lines or checking stock. It is signed-in only, so the query is
 * disabled for guests rather than firing a 401 on every navigation.
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-context";

interface CartCount {
  /** Distinct lines. A product in two variants counts twice. */
  itemCount: number;
  /** Units across every line - what the badge shows. */
  totalQuantity: number;
}

export const cartCountKey = ["cart", "count"] as const;

export function useCartCount() {
  const { isAuthenticated } = useAuth();

  const { data, isPending } = useQuery({
    queryKey: cartCountKey,
    queryFn: async () => (await api<CartCount>("/cart/count")).data,
    enabled: isAuthenticated,
    // The badge is allowed to lag a little; every mutation invalidates this
    // key anyway, so the only stale reads are ones nothing changed.
    staleTime: 30_000,
  });

  return {
    count: data?.totalQuantity ?? 0,
    itemCount: data?.itemCount ?? 0,
    /** Guests are not "loading" - they are known to have no server cart. */
    isLoading: isAuthenticated && isPending,
  };
}
