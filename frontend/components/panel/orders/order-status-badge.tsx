"use client";

/**
 * How a status looks in the panel.
 *
 * The colours come from `lib/orders/status` so a badge means the same thing on
 * both sides of the shop, but the wording does not: that module labels PENDING
 * "Order placed", which is what a customer needs to read and not what someone
 * working the queue calls it. Staff think in the API's own vocabulary, because
 * that is what the transition errors and the docs say.
 */

import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/api/orders";
import type { OrderStatusName } from "@/lib/api/admin/orders";
import { statusBadgeClass, statusMeta } from "@/lib/orders/status";

export const ORDER_STATUS_LABEL: Record<OrderStatusName, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
  CANCELED: "Canceled",
};

/** Falls back to the raw code, so a status added on the API still renders. */
export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABEL[status as OrderStatusName] ?? status;
}

/**
 * `CASH_ON_DELIVERY` -> `Cash on delivery`.
 *
 * Not `humanise` from `lib/format`, which only capitalises the first character
 * and leaves the rest as it found them - fine for the `battery_life` spec keys
 * it was written for, shouting for a SCREAMING_CASE enum.
 */
export function paymentMethodLabel(method: string): string {
  const spaced = method.replace(/[_-]+/g, " ").trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function OrderStatusBadge({
  status,
  className,
  withIcon = true,
  trailing,
}: {
  status: OrderStatus;
  className?: string;
  withIcon?: boolean;
  /**
   * Rendered inside the pill, after the label - the caret when this badge is
   * also the control that changes the status. Inside rather than beside,
   * because a caret floating off the edge reads as a separate control and
   * leaves the gap between them dead to the pointer.
   */
  trailing?: React.ReactNode;
}) {
  const Icon = statusMeta(status).icon;

  return (
    <span
      className={cn(
        // Bigger than a badge would normally be, because this one is also the
        // control that changes the status - it has to read as a target, not
        // just a label.
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap",
        statusBadgeClass(status),
        className,
      )}
    >
      {withIcon ? <Icon className="size-4" aria-hidden /> : null}
      {orderStatusLabel(status)}
      {trailing}
    </span>
  );
}

/**
 * Whether the money has been collected.
 *
 * Separate from the order status because they genuinely come apart: a
 * cash-on-delivery order is DUE right up until the courier hands it over, and
 * a RETURNED one can be PAID and awaiting a refund.
 */
export function PaymentBadge({ status }: { status: string }) {
  const tone =
    status === "PAID"
      ? "bg-success/12 text-success"
      : status === "REFUNDED"
        ? "bg-muted text-muted-foreground"
        : "bg-warning/15 text-warning-foreground dark:text-warning";

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide uppercase",
        tone,
      )}
    >
      {status}
    </span>
  );
}
