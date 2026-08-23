/**
 * Orders, from the staff side.
 *
 * A different surface from `lib/api/orders`, and mounted on a different prefix
 * (`/admin/orders`), because the two differ in the way that matters: every
 * read here is unscoped and reaches every order in the system, where the
 * customer routes derive the owner from the token. The API keeps them in
 * separate routers for the same reason - see `order.admin.routes.js`.
 *
 * Three things about this surface are worth knowing before using it:
 *
 * **Money is not editable.** There is no endpoint that changes a price, a
 * quantity, a line or a total. `updateDetails` reaches the delivery details
 * and nothing else. That is deliberate on the API's side, so a screen offering
 * it would be offering something that does not exist.
 *
 * **Status moves along a map, not freely.** `ORDER_STATUS_FLOW` mirrors the
 * server's own table; anything outside it answers 422. RETURNED and CANCELED
 * additionally demand a note, and a finished order refuses detail edits
 * outright.
 *
 * **Both deletes are admin-and-above**, one rung higher than the rest of this
 * router - see `lib/panel/permissions`, which mirrors that gate.
 */

import { api } from "@/lib/api/client";
import type { PaginationMeta } from "@/lib/api/types";
import type {
  Order,
  OrderItem,
  OrderStatus,
  ShippingAddress,
} from "@/lib/api/orders";

/* --------------------------------- enums --------------------------------- */

export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RETURNED",
  "CANCELED",
] as const;

/**
 * The concrete six.
 *
 * `OrderStatus` is deliberately open (`| (string & {})`) so an unknown status
 * from a newer API still renders. That openness is wrong for a lookup table -
 * `Record<OrderStatus, T>` collapses to `Record<string, T>` and would promise
 * an answer for every string - so the maps below key on this instead.
 */
export type OrderStatusName = (typeof ORDER_STATUSES)[number];

/**
 * Which transitions are legal, mirroring `ORDER_STATUS_FLOW` in the API's
 * constants rather than inventing a second opinion.
 *
 * The point of having it on the client at all is that the status control can
 * offer only the moves that will succeed. RETURNED and CANCELED are terminal:
 * an order that ended has ended, and re-opening it would silently re-reserve
 * stock that was already released.
 */
export const ORDER_STATUS_FLOW: Record<OrderStatusName, OrderStatusName[]> = {
  PENDING: ["CONFIRMED", "CANCELED"],
  /*
   * A confirmed order can finish without ever being marked out for delivery.
   * The dispatch step is real but not always recorded - a rider takes a parcel
   * straight out, or it is handed over at the counter - and forcing the status
   * through first makes staff type a step that already passed rather than
   * making it happen.
   */
  CONFIRMED: ["OUT_FOR_DELIVERY", "DELIVERED", "RETURNED", "CANCELED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "RETURNED", "CANCELED"],
  DELIVERED: ["RETURNED"],
  RETURNED: [],
  CANCELED: [],
};

/**
 * Outcomes that went wrong, and therefore demand a written reason. The API
 * rejects a noteless RETURNED or CANCELED with `ORDER_STATUS_NOTE_REQUIRED`;
 * asking for the note up front is friendlier than round-tripping to find out.
 */
export const ORDER_NEGATIVE_STATUSES: OrderStatusName[] = [
  "RETURNED",
  "CANCELED",
];

/** Statuses whose delivery details the API refuses to edit, being a record. */
export const ORDER_FINAL_STATUSES: OrderStatusName[] = [
  "DELIVERED",
  "RETURNED",
  "CANCELED",
];

export const PAYMENT_METHODS = ["CASH_ON_DELIVERY"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ["DUE", "PAID", "REFUNDED"] as const;

/** Where an order may go from here. Empty for a terminal one. */
export function nextStatuses(status: OrderStatus): OrderStatusName[] {
  return ORDER_STATUS_FLOW[status as OrderStatusName] ?? [];
}

export function requiresNote(status: OrderStatus): boolean {
  return ORDER_NEGATIVE_STATUSES.includes(status as OrderStatusName);
}

export function isFinalStatus(status: OrderStatus): boolean {
  return ORDER_FINAL_STATUSES.includes(status as OrderStatusName);
}

/* --------------------------------- shapes -------------------------------- */

/**
 * What the order was placed from.
 *
 * Evidence, not identity - every field is client-supplied or derived from
 * client-supplied text, and none of it authorises anything. It is here so
 * support can make sense of a complaint and so a pattern of fraudulent orders
 * has something to correlate on.
 */
export interface OrderClientInfo {
  ip: string | null;
  userAgent: string | null;
  os: string | null;
  browser: string | null;
  device: string | null;
}

/**
 * A status change, as staff see it.
 *
 * `changedBy` is the actor's **integer** user id, not a name - the API stores
 * a `Number` ref and presents it unpopulated. (The customer-facing
 * `OrderStatusEvent` in `lib/api/orders` types it as a string; it is never
 * rendered there, which is why the mistake has gone unnoticed.)
 */
export interface AdminOrderStatusEvent {
  status: OrderStatus;
  note: string | null;
  changedBy: number | null;
  changedAt: string;
}

export interface AdminOrderItem extends OrderItem {
  /**
   * Units actually taken out of inventory for this line - 0 when the product
   * does not track stock. Recorded at purchase rather than recomputed, so
   * cancelling puts back what was really reserved.
   */
  reservedQuantity: number;
}

/** Everything the customer shape carries, plus what staff need to work a queue. */
export interface AdminOrder
  extends Omit<Order, "items" | "statusHistory"> {
  items: AdminOrderItem[];
  statusHistory: AdminOrderStatusEvent[];
  /** Null for a guest checkout. */
  userId: number | null;
  client: OrderClientInfo | null;
  /** Whether the reserved units have already gone back on the shelf. */
  stockReleased: boolean;
  updatedBy: number | null;
  /**
   * Last write of any kind - a status change, a detail correction, a delete.
   * Absent from the customer shape, which has no reason to care.
   */
  updatedAt: string;
  /** Set by a soft delete. Only ever non-null when `includeDeleted` was asked for. */
  deletedAt: string | null;
}

/**
 * What the staff listing accepts - and no more. The body is `.strict()`, so an
 * unknown key is a 422 rather than an ignored field.
 */
export interface AdminOrderQuery {
  status?: OrderStatusName | OrderStatusName[];
  paymentMethod?: PaymentMethod;
  /** One box: matches order number, customer name, phone or email. */
  search?: string;
  userId?: number;
  /** Narrow to checkouts with no account behind them. */
  guestOnly?: boolean;
  minTotal?: number;
  maxTotal?: number;
  /** ISO date-times; the API coerces them. */
  placedFrom?: string;
  placedTo?: string;
  /** Soft-deleted orders are hidden unless this is true. */
  includeDeleted?: boolean;
  sort?: { field?: "placedAt" | "total" | "status"; direction?: "asc" | "desc" };
  pagination?: { page?: number; limit?: number };
}

export interface AdminOrderPage {
  orders: AdminOrder[];
  meta: PaginationMeta | null;
}

/* -------------------------------- payloads -------------------------------- */

export interface ChangeStatusPayload {
  status: OrderStatusName;
  /** Required by the API for RETURNED and CANCELED. */
  note?: string;
}

/**
 * A correction to where the parcel goes.
 *
 * Address fields **merge** server-side, so sending only `city` fixes the city
 * without wiping the street. `note` is nullish rather than optional on
 * purpose: `null` clears the customer's delivery instruction, `undefined`
 * leaves it alone.
 *
 * The delivery charge is not recalculated when the district changes. The total
 * is what the customer agreed to pay, and a typo fix must not silently change
 * what the courier collects at the door.
 */
export interface UpdateOrderDetailsPayload {
  contact?: { name?: string; phone?: string };
  shippingAddress?: Partial<ShippingAddress>;
  note?: string | null;
}

export interface HardDeleteResult {
  id: number;
  orderNumber: string;
}

/* ---------------------------------- api ---------------------------------- */

export const adminOrdersApi = {
  async list(query: AdminOrderQuery): Promise<AdminOrderPage> {
    const payload = await api<{ orders: AdminOrder[] }>(
      "/admin/orders/filter",
      { method: "POST", body: query },
    );

    return { orders: payload.data.orders, meta: payload.meta ?? null };
  },

  /**
   * One order by its **integer** id - not the six-digit `orderNumber` the
   * customer quotes. Unlike the listing, this reaches soft-deleted orders:
   * the controller passes `includeDeleted: true`, so a deleted order opened
   * from a link still renders instead of 404ing.
   */
  async get(id: number): Promise<AdminOrder> {
    const payload = await api<{ order: AdminOrder }>(`/admin/orders/${id}`);
    return payload.data.order;
  },

  async changeStatus(
    id: number,
    body: ChangeStatusPayload,
  ): Promise<AdminOrder> {
    const payload = await api<{ order: AdminOrder }>(
      `/admin/orders/${id}/status`,
      { method: "PATCH", body },
    );
    return payload.data.order;
  },

  async updateDetails(
    id: number,
    body: UpdateOrderDetailsPayload,
  ): Promise<AdminOrder> {
    const payload = await api<{ order: AdminOrder }>(`/admin/orders/${id}`, {
      method: "PATCH",
      body,
    });
    return payload.data.order;
  },

  /**
   * Hides the order without destroying it. An order is a financial record -
   * what a refund, a tax return and a dispute are argued from - so the default
   * removal keeps the row and the numbers, and a live order's stock is
   * released on the way out.
   */
  async softDelete(id: number): Promise<AdminOrder> {
    const payload = await api<{ order: AdminOrder }>(`/admin/orders/${id}`, {
      method: "DELETE",
    });
    return payload.data.order;
  },

  /**
   * Genuinely irreversible, and its own path rather than a flag on the soft
   * delete - a destructive operation should be something asked for by name,
   * not something a stray query parameter turns on. Rate-limited at the
   * sensitive tier.
   */
  async hardDelete(id: number): Promise<HardDeleteResult> {
    const payload = await api<HardDeleteResult>(
      `/admin/orders/${id}/permanent`,
      { method: "DELETE" },
    );
    return payload.data;
  },
};
