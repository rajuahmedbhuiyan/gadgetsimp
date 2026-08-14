import type { Metadata } from "next";

import { container } from "@/components/home/section";
import { CartView } from "@/components/cart/cart-view";

export const metadata: Metadata = {
  title: "Your cart",
  description: "Review the items in your cart before checking out.",
  // A personal, signed-in page - nothing here belongs in an index.
  robots: { index: false, follow: false },
};

/**
 * The cart.
 *
 * A thin server shell: the cart itself is per-session data behind an access
 * token, so there is nothing to fetch here that the server render could reuse.
 * `CartView` owns the loading, signed-out, empty and populated states.
 */
export default function CartPage() {
  return (
    <div className={`${container} py-6 lg:py-10`}>
      <header className="mb-6 lg:mb-8">
        <h1 className="font-heading text-2xl font-bold tracking-tight lg:text-3xl">
          Your cart
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review your items, then check out with cash on delivery.
        </p>
      </header>

      <CartView />
    </div>
  );
}
