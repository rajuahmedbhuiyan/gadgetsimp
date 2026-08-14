import type { Metadata } from "next";

import { container } from "@/components/home/section";
import { OrdersView } from "@/components/orders/orders-view";

export const metadata: Metadata = {
  title: "My orders",
  description: "Track your orders and see what you have bought.",
  // Personal and signed-in - nothing to index.
  robots: { index: false, follow: false },
};

/**
 * The customer's own orders.
 *
 * A thin server shell: the list comes from `POST /orders/filter`, which
 * derives the owner from the access token, so there is nothing the server
 * render could fetch on their behalf.
 */
export default function OrdersPage() {
  return (
    <div className={`${container} py-6 lg:py-10`}>
      <header className="mb-6 lg:mb-8">
        <h1 className="font-heading text-2xl font-bold tracking-tight lg:text-3xl">
          My orders
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Track a delivery, or look back at something you bought.
        </p>
      </header>

      <OrdersView />
    </div>
  );
}
