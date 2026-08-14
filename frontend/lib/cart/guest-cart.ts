"use client";

/**
 * The cart for someone who is not signed in.
 *
 * No API: a guest has no server-side cart, so the lines live in
 * `localStorage` and are shaped to match what `GET /cart` returns. Everything
 * downstream - the cart page, the badge, checkout - reads the same `Cart` type
 * either way and never has to ask which kind it is looking at.
 *
 * Each line carries a **snapshot** of the price and name taken when it was
 * added, because there is nothing to ask. That snapshot is display only: the
 * order endpoint re-prices every line from the catalog and refuses the whole
 * order if anything moved, so a stale figure here can never become a stale
 * figure charged.
 *
 * An external store rather than React state, so the badge in the header and
 * the page body stay in step without a provider between them.
 */

import type { Cart, CartLine } from "@/lib/api/cart";
import type { Media, ProductType } from "@/lib/api/shop";

const KEY = "gadgetsimp:guest-cart";

/** What is actually persisted. Derived figures are recomputed on read. */
export interface GuestEntry {
  productId: string;
  /** Required for a VARIABLE product, absent for a SIMPLE one. */
  variantId: string | null;
  quantity: number;
  name: string;
  slug: string | null;
  thumbnail: Media | null;
  productType: ProductType | null;
  currency: string;
  unitPrice: number;
  originalPrice: number | null;
  variantLabel: string | null;
  variantSku: string | null;
  /** Stock ceiling as it stood when this was added; `null` means unknown. */
  maxQuantity: number | null;
  addedAt: string;
}

/** A cart line is a product *plus a variant*, so the pair is the identity. */
export function lineIdFor(productId: string, variantId: string | null) {
  return `${productId}:${variantId ?? ""}`;
}

/* ------------------------------- the store ------------------------------- */

let entries: GuestEntry[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function load(): GuestEntry[] {
  if (loaded) return entries;
  loaded = true;

  try {
    const raw = localStorage.getItem(KEY);
    entries = raw ? (JSON.parse(raw) as GuestEntry[]) : [];
  } catch {
    entries = [];
  }
  return entries;
}

function commit(next: GuestEntry[]) {
  entries = next;
  loaded = true;

  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota. The cart still works for this page view.
  }

  for (const listener of listeners) listener();
}

export function subscribeGuestCart(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The snapshot `useSyncExternalStore` reads. Identity is stable between writes. */
export function getGuestEntries(): GuestEntry[] {
  return load();
}

/** The server never sees this store, so a server render has nothing to show. */
export function getServerGuestEntries(): GuestEntry[] {
  return EMPTY_ENTRIES;
}

const EMPTY_ENTRIES: GuestEntry[] = [];

/* ------------------------------- operations ------------------------------ */

/** Adding something already in the cart increases that line, as the API does. */
export function addGuestEntry(entry: Omit<GuestEntry, "addedAt">) {
  const current = load();
  const id = lineIdFor(entry.productId, entry.variantId);
  const existing = current.find(
    (line) => lineIdFor(line.productId, line.variantId) === id,
  );

  if (existing) {
    commit(
      current.map((line) =>
        line === existing
          ? { ...line, quantity: capped(line.quantity + entry.quantity, line) }
          : line,
      ),
    );
    return;
  }

  commit([...current, { ...entry, addedAt: new Date().toISOString() }]);
}

/** Absolute quantity, and `0` removes - the same contract as `PATCH /cart/items`. */
export function setGuestQuantity(lineId: string, quantity: number) {
  const next = load()
    .map((line) =>
      lineIdFor(line.productId, line.variantId) === lineId
        ? { ...line, quantity: capped(quantity, line) }
        : line,
    )
    .filter((line) => line.quantity > 0);

  commit(next);
}

export function removeGuestEntries(lineIds: string[]) {
  const doomed = new Set(lineIds);
  commit(
    load().filter(
      (line) => !doomed.has(lineIdFor(line.productId, line.variantId)),
    ),
  );
}

export function clearGuestCart() {
  commit([]);
}

/** The API caps a line at 100, and at remaining stock where it knows it. */
function capped(quantity: number, line: GuestEntry) {
  const ceiling = line.maxQuantity == null ? 100 : Math.min(line.maxQuantity, 100);
  return Math.max(0, Math.min(quantity, Math.max(1, ceiling)));
}

/* ------------------------------ presentation ----------------------------- */

/**
 * The same shape `GET /cart` answers with, so nothing downstream branches.
 *
 * `purchasable` is optimistic here - a guest cannot check stock without an
 * API - which is safe because the order endpoint is all-or-nothing and names
 * any line it refuses.
 */
export function toCart(entries: GuestEntry[]): Cart {
  const items: CartLine[] = entries.map((entry) => {
    const lineTotal = entry.unitPrice * entry.quantity;
    const originalLineTotal = (entry.originalPrice ?? entry.unitPrice) * entry.quantity;

    return {
      id: lineIdFor(entry.productId, entry.variantId),
      product: {
        id: entry.productId,
        name: entry.name,
        slug: entry.slug,
        thumbnail: entry.thumbnail,
        productType: entry.productType,
      },
      variant: entry.variantId
        ? {
            id: entry.variantId,
            sku: entry.variantSku ?? "",
            options: {},
            label: entry.variantLabel ?? "",
            image: null,
          }
        : null,
      quantity: entry.quantity,
      currency: entry.currency,
      unitPrice: entry.unitPrice,
      originalPrice: entry.originalPrice,
      discountPercent:
        entry.originalPrice && entry.originalPrice > entry.unitPrice
          ? Math.round(
              ((entry.originalPrice - entry.unitPrice) / entry.originalPrice) * 100,
            )
          : 0,
      lineTotal,
      originalLineTotal,
      availability: {
        purchasable: true,
        inStock: true,
        maxQuantity: entry.maxQuantity,
      },
      issues: [],
      addedAt: entry.addedAt,
    };
  });

  const subtotal = items.reduce((sum, line) => sum + line.lineTotal, 0);
  const originalSubtotal = items.reduce(
    (sum, line) => sum + line.originalLineTotal,
    0,
  );

  return {
    items,
    summary: {
      currency: items[0]?.currency ?? "BDT",
      itemCount: items.length,
      totalQuantity: items.reduce((sum, line) => sum + line.quantity, 0),
      subtotal,
      originalSubtotal,
      discount: originalSubtotal - subtotal,
      unavailableCount: 0,
      hasIssues: false,
      checkoutReady: items.length > 0,
    },
  };
}
