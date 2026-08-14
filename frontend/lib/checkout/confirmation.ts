"use client";

/**
 * Carrying the placed order from checkout to the confirmation screen.
 *
 * It has to be stashed rather than re-fetched: `GET /orders/{id}` is
 * signed-in only, and half the point of this checkout is that a guest can use
 * it. The POST response is the only time a guest ever sees their own order, so
 * the confirmation page reads it from here.
 *
 * `sessionStorage`, not `localStorage`: it is scoped to the tab and cleared
 * when it closes, which is the right lifetime for a receipt. It survives the
 * navigation and a refresh, which is all that is needed.
 */

import type { AccountInvite, Order } from "@/lib/api/orders";

const KEY = "gadgetsimp:last-order";

export interface Confirmation {
  order: Order;
  accountInvite: AccountInvite | null;
  /** True when a retried idempotency key returned the original order. */
  alreadyPlaced: boolean;
}

export function saveConfirmation(confirmation: Confirmation) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(confirmation));
  } catch {
    // Private mode, or a full quota. The confirmation page falls back to a
    // generic "order placed" rather than the receipt - the order itself is
    // already safely on the server either way.
  }
}

export function readConfirmation(): Confirmation | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Confirmation) : null;
  } catch {
    return null;
  }
}

export function clearConfirmation() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* Nothing to clean up if it was never written. */
  }
}
