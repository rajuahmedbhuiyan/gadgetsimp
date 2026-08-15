/**
 * Saved products.
 *
 * Signed-in only, and the owner is never a field - it comes from the token, so
 * no request shape can reach somebody else's list. Unlike the cart there is no
 * guest equivalent: a wishlist that vanished when the browser cleared its
 * storage would be worse than one that asks you to sign in.
 *
 * Products, never variants. A wishlist records "I want this thing"; which
 * colour is a decision made at the point of buying, and a saved item should
 * not disappear because one SKU was discontinued.
 */

import { api } from "./client";
import type { ProductCard } from "./shop";
import type { PaginationMeta } from "./types";

/**
 * A saved item is the same card the shop grid renders - the server builds both
 * from one projection, so a saved product and a browsed one cannot disagree
 * about price or discount - plus when it was saved and whether it still exists.
 */
export interface WishlistItem extends ProductCard {
  /** The product id, which is what every write here is addressed by. */
  productId: string;
  addedAt: string;
  /**
   * `false` once the product has been withdrawn, unpublished or deleted.
   *
   * Such entries are still returned rather than hidden, and deliberately so: a
   * row the shopper cannot see is a row they can never remove.
   */
  available: boolean;
}

export type WishlistSortField = "addedAt" | "price" | "name";

export interface WishlistQuery {
  search?: string;
  price?: { min?: number; max?: number };
  /** Buyable right now. Saved items are routinely out of stock, so opt-in. */
  inStock?: boolean;
  availableOnly?: boolean;
  sort?: { field?: WishlistSortField; direction?: "asc" | "desc" };
  pagination?: { page?: number; limit?: number };
}

export interface WishlistPage {
  items: WishlistItem[];
  meta: PaginationMeta | null;
}

export interface WishlistTotals {
  /** What the server holds after the write, so the UI need not recount. */
  total: number;
}

export const wishlistApi = {
  async filter(query: WishlistQuery): Promise<WishlistPage> {
    const payload = await api<{ items: WishlistItem[] }>("/wishlist/filter", {
      method: "POST",
      body: query,
    });

    return { items: payload.data.items, meta: payload.meta ?? null };
  },

  /** Batched, because clearing a selection is one request rather than ten. */
  remove(productIds: string[]) {
    return api<WishlistTotals>("/wishlist/items", {
      method: "DELETE",
      body: { productIds },
    });
  },

  clear() {
    return api<WishlistTotals>("/wishlist", { method: "DELETE" });
  },
};
