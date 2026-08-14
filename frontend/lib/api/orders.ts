/**
 * Placing an order.
 *
 * The one rule that shapes this whole module: **no price field is accepted**.
 * Not a unit price, not a subtotal, not a total. The schema is strict, so
 * sending one is a 422 rather than a field the server ignores. Everything
 * monetary comes back from the response and is rendered from there.
 */

import { api } from "./client";

/* --------------------------------- types -------------------------------- */

/**
 * The six the API actually uses.
 *
 * The happy path is PENDING -> CONFIRMED -> OUT_FOR_DELIVERY -> DELIVERED.
 * RETURNED and CANCELED are terminal: an order that ended has ended, and
 * re-opening it would silently re-reserve stock that was already released.
 */
export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "RETURNED"
  | "CANCELED"
  | (string & {});

export interface OrderStatusEvent {
  status: OrderStatus;
  note: string | null;
  /** The staff account that made the change; `null` for automatic transitions. */
  changedBy: string | null;
  changedAt: string;
}

export interface ShippingAddress {
  line1: string;
  line2?: string;
  area?: string;
  city: string;
  district?: string;
  postalCode?: string;
  country?: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  slug: string | null;
  sku: string | null;
  /**
   * A bare URL, **not** the `{ src, alt }` object the catalog and cart use.
   *
   * An order line is a frozen snapshot written at purchase time, and the model
   * stores it as a plain string (`order.model.js`: `thumbnail: { type: String }`)
   * from `product.thumbnail?.src`. Reading `.src` off it silently yields
   * `undefined`, which renders as a missing-image placeholder on an order that
   * has a perfectly good picture.
   */
  thumbnail?: string | null;
  variantOptions: Record<string, string> | null;
  variantLabel: string | null;
  unitPrice: number;
  originalPrice: number | null;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  /** Internal integer, used in API paths. */
  id: number;
  /** The six-digit number the customer quotes on the phone. Show this one. */
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  currency: string;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  itemCount: number;
  totalQuantity: number;
  items: OrderItem[];
  contact: { name: string; phone: string };
  email: string | null;
  shippingAddress: ShippingAddress;
  note: string | null;
  isGuestOrder: boolean;
  /** Oldest first. What the tracker timestamps each step from. */
  statusHistory: OrderStatusEvent[];
  placedAt: string;
  createdAt: string;
}

/** Only ever present for a guest who asked to turn the purchase into an account. */
export interface AccountInvite {
  status: "VERIFICATION_SENT" | "ACCOUNT_EXISTS" | "INVITATION_FAILED" | (string & {});
  email?: string;
}

export interface PlaceOrderInput {
  items: { productId: string; variantId?: string; quantity: number }[];
  contact: { name: string; phone: string };
  shippingAddress: ShippingAddress;
  note?: string;
  paymentMethod?: "CASH_ON_DELIVERY";
  createAccount?: boolean;
  email?: string;
  idempotencyKey?: string;
}

export interface OrdersQuery {
  status?: OrderStatus | OrderStatus[];
  placedFrom?: string;
  placedTo?: string;
  sort?: { field?: "placedAt" | "total" | "status"; direction?: "asc" | "desc" };
  pagination?: { page?: number; limit?: number };
}

export interface PlaceOrderResult {
  order: Order;
  accountInvite: AccountInvite | null;
}

/* ------------------------------- endpoints ------------------------------- */

export const ordersApi = {
  /**
   * Place the order. Works signed in or as a guest.
   *
   * All or nothing: if any line is unavailable or short on stock the whole
   * order is refused with 422 naming each offending position, and no stock is
   * reserved. An order is a commitment, so a quantity that cannot be met is
   * the wrong order rather than something to quietly reduce.
   */
  place(input: PlaceOrderInput) {
    return api<PlaceOrderResult>("/orders", { method: "POST", body: input });
  },

  /**
   * The signed-in customer's own orders.
   *
   * There is no `userId` field - the owner comes from the token, so this can
   * only ever return your own.
   */
  filter(query: OrdersQuery = {}) {
    return api<{ orders: Order[] }>("/orders/filter", {
      method: "POST",
      body: query,
    });
  },

  /**
   * One order, by its **integer** id - not the six-digit `orderNumber` the
   * customer quotes.
   *
   * Signed-in only, and someone else's order answers 404 rather than 403:
   * ids are sequential, and "exists but is not yours" is itself information.
   */
  get(id: number) {
    return api<{ order: Order }>(`/orders/${id}`);
  },
};

/**
 * A key that survives a retry.
 *
 * A double-tapped "Place order" on a flaky mobile connection is the normal way
 * duplicate cash-on-delivery orders get created, and the customer finds out
 * when two couriers arrive. The same key sent twice returns the original order
 * with `code: ORDER_ALREADY_PLACED` instead of placing a second one.
 *
 * Generated once when the form mounts, not per submit - a fresh key on the
 * retry would defeat the entire point.
 */
export function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // The API only needs 8-120 stable characters, not cryptographic strength.
  return `gs-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
