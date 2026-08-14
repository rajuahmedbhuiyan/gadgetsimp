/**
 * The cart.
 *
 * Signed-in only, and every endpoint answers with **the whole cart** rather
 * than a delta - so callers assign the response to state instead of merging
 * into it. That is also why there is no local reducer here: the server is the
 * only thing that knows what a line costs and whether it can still be bought.
 */

import { api } from "./client";
import type { Media, ProductType } from "./shop";

/* --------------------------------- types -------------------------------- */

/**
 * Why a line cannot be bought, or what changed under it.
 *
 * `INSUFFICIENT_STOCK` is deliberately distinct from `OUT_OF_STOCK`: some
 * remain, just fewer than the shopper is holding. `PRICE_CHANGED` does not
 * block checkout - it is a courtesy.
 */
export type CartIssueCode =
  | "PRODUCT_UNAVAILABLE"
  | "VARIANT_UNAVAILABLE"
  | "OUT_OF_STOCK"
  | "INSUFFICIENT_STOCK"
  | "PRICE_CHANGED"
  | (string & {});

export interface CartIssue {
  code: CartIssueCode;
  message: string;
}

export interface CartLineVariant {
  id: string;
  sku: string;
  options: Record<string, string>;
  /** Pre-joined by the server, e.g. `Color: Black`. */
  label: string;
  image?: Media | null;
}

export interface CartLine {
  /** The **line** id. Every mutation addresses this, never the product id. */
  id: string;
  product: {
    id: string;
    /** Null when the product has been deleted outright. */
    name: string | null;
    slug: string | null;
    thumbnail?: Media | null;
    productType: ProductType | null;
  };
  variant: CartLineVariant | null;
  quantity: number;
  currency: string;
  /** Null when the catalog can no longer price this line. */
  unitPrice: number | null;
  originalPrice?: number | null;
  discountPercent: number;
  lineTotal: number;
  originalLineTotal: number;
  availability: {
    /** The single field checkout gates on - it folds in every issue. */
    purchasable: boolean;
    inStock: boolean;
    /** `null` means no ceiling, **not** zero. */
    maxQuantity: number | null;
  };
  issues: CartIssue[];
  addedAt: string;
}

export interface CartSummary {
  currency: string;
  itemCount: number;
  /** Counts every line, including unavailable ones. This is the header badge. */
  totalQuantity: number;
  /** Purchasable lines only - the figure the shopper can actually pay. */
  subtotal: number;
  originalSubtotal: number;
  discount: number;
  unavailableCount: number;
  hasIssues: boolean;
  checkoutReady: boolean;
}

export interface Cart {
  items: CartLine[];
  summary: CartSummary;
}

/**
 * A change the server made rather than rejecting - in practice, a quantity
 * capped to remaining stock. Silently dropping these means the shopper gets
 * fewer than they asked for and only finds out on the invoice.
 */
export interface CartAdjustment {
  itemId?: string;
  code?: string;
  message: string;
}

export interface CartResponse {
  cart: Cart;
  adjustments: CartAdjustment[];
}

/* ------------------------------- endpoints ------------------------------- */

export const cartApi = {
  get() {
    return api<CartResponse>("/cart");
  },

  /**
   * Absolute quantities, not deltas, addressed by line id.
   *
   * **A quantity of 0 removes the line**, which is why the stepper never has
   * to switch endpoints as it decrements past one - the "the last one will not
   * delete" bug is designed out at the API.
   */
  updateItems(items: { itemId: string; quantity: number }[]) {
    return api<CartResponse>("/cart/items", { method: "PATCH", body: { items } });
  },

  /**
   * Batch removal.
   *
   * A `DELETE` that carries a JSON body, so one request removes N lines
   * instead of N requests that can half-succeed. `fetch` sends it natively;
   * anything built on axios needs `{ data: { itemIds } }`.
   */
  removeItems(itemIds: string[]) {
    return api<CartResponse>("/cart/items", {
      method: "DELETE",
      body: { itemIds },
    });
  },

  /** Idempotent - clearing an empty cart succeeds and returns the empty cart. */
  clear() {
    return api<CartResponse>("/cart", { method: "DELETE" });
  },
};

/* -------------------------------- helpers -------------------------------- */

/** What an empty cart looks like, for rendering before the first response. */
export const EMPTY_CART: Cart = {
  items: [],
  summary: {
    currency: "BDT",
    itemCount: 0,
    totalQuantity: 0,
    subtotal: 0,
    originalSubtotal: 0,
    discount: 0,
    unavailableCount: 0,
    hasIssues: false,
    checkoutReady: false,
  },
};

/** The API's ceiling per line, used when a line reports no maximum. */
export const MAX_PER_LINE = 100;

/** How high the stepper may go for a line. `maxQuantity: null` means no cap. */
export function lineCeiling(line: CartLine) {
  const { maxQuantity } = line.availability;
  return maxQuantity == null ? MAX_PER_LINE : Math.min(maxQuantity, MAX_PER_LINE);
}
