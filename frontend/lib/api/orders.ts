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

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELED"
  | "RETURNED"
  | (string & {});

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

  /** Signed-in only - a guest cannot re-read their own order. */
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
