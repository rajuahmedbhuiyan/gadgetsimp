/**
 * What an order status means to the person who placed it.
 *
 * The API's flow is a straight line with two exits:
 *
 *   PENDING -> CONFIRMED -> OUT_FOR_DELIVERY -> DELIVERED
 *                     \__ CANCELED / RETURNED (terminal)
 *
 * So tracking is four steps plus an "it ended early" case, rather than a
 * general-purpose state machine. Modelling it as a line is what lets the
 * detail page show a progress bar instead of a list of codes.
 */

import {
  CircleCheck,
  CircleSlash,
  ClipboardCheck,
  PackageCheck,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import type { Order, OrderStatus } from "@/lib/api/orders";

export interface StatusMeta {
  label: string;
  /** What it means, in the shopper's terms rather than the warehouse's. */
  description: string;
  icon: LucideIcon;
  /** Drives the badge colour. */
  tone: "pending" | "progress" | "success" | "danger";
}

export const STATUS_META: Record<OrderStatus, StatusMeta> = {
  PENDING: {
    label: "Order placed",
    description: "We have your order and will call to confirm it.",
    icon: ClipboardCheck,
    tone: "pending",
  },
  CONFIRMED: {
    label: "Confirmed",
    description: "Confirmed and being packed.",
    icon: PackageCheck,
    tone: "progress",
  },
  OUT_FOR_DELIVERY: {
    label: "Out for delivery",
    description: "With the rider. Keep your phone nearby.",
    icon: Truck,
    tone: "progress",
  },
  DELIVERED: {
    label: "Delivered",
    description: "Handed over and paid for.",
    icon: CircleCheck,
    tone: "success",
  },
  RETURNED: {
    label: "Returned",
    description: "The parcel came back to us.",
    icon: Undo2,
    tone: "danger",
  },
  CANCELED: {
    label: "Canceled",
    description: "This order will not be delivered.",
    icon: CircleSlash,
    tone: "danger",
  },
};

export function statusMeta(status: OrderStatus): StatusMeta {
  return (
    STATUS_META[status] ?? {
      label: status,
      description: "",
      icon: ClipboardCheck,
      tone: "pending",
    }
  );
}

/** The happy path, in order. Everything else is an exit from it. */
export const TRACK_STEPS: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

export function isTerminated(status: OrderStatus) {
  return status === "CANCELED" || status === "RETURNED";
}

export interface TrackStep extends StatusMeta {
  status: OrderStatus;
  /** Already happened. */
  done: boolean;
  /** Where the order is right now. */
  current: boolean;
  /** From `statusHistory`, so a step only carries a time if it really happened. */
  at: string | null;
}

/**
 * The tracker, resolved against the order's own history.
 *
 * Timestamps come from `statusHistory` rather than being inferred, so a step
 * shows a time only if the order genuinely passed through it - an order that
 * jumped straight from CONFIRMED to DELIVERED does not get an invented
 * out-for-delivery time.
 */
export function trackSteps(order: Order): TrackStep[] {
  const reached = new Map(
    order.statusHistory?.map((event) => [event.status, event.changedAt]) ?? [],
  );

  // A terminated order stops wherever it got to, so progress is measured from
  // the last step it actually reached rather than from its current status.
  const currentIndex = isTerminated(order.status)
    ? TRACK_STEPS.reduce(
        (last, step, index) => (reached.has(step) ? index : last),
        0,
      )
    : TRACK_STEPS.indexOf(order.status);

  return TRACK_STEPS.map((status, index) => ({
    ...statusMeta(status),
    status,
    done: index < currentIndex || (index === currentIndex && index >= 0),
    current: index === currentIndex && !isTerminated(order.status),
    at: reached.get(status) ?? null,
  }));
}

/** `0` to `1`, for the bar behind the steps. */
export function trackProgress(order: Order) {
  if (isTerminated(order.status)) return 0;
  const index = TRACK_STEPS.indexOf(order.status);
  if (index < 0) return 0;
  return index / (TRACK_STEPS.length - 1);
}

const TONE_BADGE: Record<StatusMeta["tone"], string> = {
  pending: "bg-muted text-foreground",
  progress: "bg-brand/15 text-brand-foreground dark:text-brand",
  success: "bg-success/15 text-success",
  danger: "bg-destructive/10 text-destructive",
};

export function statusBadgeClass(status: OrderStatus) {
  return TONE_BADGE[statusMeta(status).tone];
}

/** `2026-08-14T18:55:40.987Z` -> `14 Aug 2026, 6:55 pm`. */
export function formatOrderDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
