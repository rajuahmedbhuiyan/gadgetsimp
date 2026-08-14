import type { Metadata } from "next";

import { container } from "@/components/home/section";
import { OrderSuccessView } from "@/components/checkout/order-success-view";

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false },
};

/**
 * The confirmation.
 *
 * Nothing is fetched here: the order is read from session storage, because
 * `GET /orders/{id}` is signed-in only and the POST response is the only time
 * a guest ever sees their own order.
 */
export default function CheckoutSuccessPage() {
  return (
    <div className={`${container} py-10 lg:py-16`}>
      <OrderSuccessView />
    </div>
  );
}
