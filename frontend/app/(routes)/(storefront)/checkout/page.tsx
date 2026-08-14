import type { Metadata } from "next";

import { container } from "@/components/home/section";
import { CheckoutView } from "@/components/checkout/checkout-view";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Confirm your delivery details and place your order.",
  // Personal, signed-in, and transient - nothing to index.
  robots: { index: false, follow: false },
};

/**
 * Checkout.
 *
 * A thin server shell. The order is built from the cart, which is per-session
 * data behind an access token, so `CheckoutView` owns every state - resolving,
 * signed out, empty cart, blocked cart, and the form itself.
 */
export default function CheckoutPage() {
  return (
    <div className={`${container} py-6 lg:py-10`}>
      <header className="mb-6 lg:mb-8">
        <h1 className="font-heading text-2xl font-bold tracking-tight lg:text-3xl">
          Checkout
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cash on delivery. We call to confirm before the parcel is dispatched.
        </p>
      </header>

      <CheckoutView />
    </div>
  );
}
