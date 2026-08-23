"use client";

import type { ShippingAddress } from "@/lib/api/orders";

const KEY = "gadgetsimp:checkout-address";

export interface SavedCheckoutAddress {
  fullName: string;
  phone: string;
  address: ShippingAddress;
}

export function saveCheckoutAddress(address: SavedCheckoutAddress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(address));
  } catch {
    // Checkout has already succeeded; storage failure must not affect the order.
  }
}

export function readCheckoutAddress(): SavedCheckoutAddress | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedCheckoutAddress>;
    if (
      !parsed.fullName ||
      !parsed.phone ||
      !parsed.address?.line1 ||
      !parsed.address?.city
    ) {
      return null;
    }

    return parsed as SavedCheckoutAddress;
  } catch {
    return null;
  }
}
