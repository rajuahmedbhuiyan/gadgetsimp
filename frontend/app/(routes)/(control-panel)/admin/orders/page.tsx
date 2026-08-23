import type { Metadata } from "next";
import { Suspense } from "react";

import { OrdersView } from "@/components/panel/orders/orders-view";

export const metadata: Metadata = { title: "Orders" };

/**
 * The staff order queue.
 *
 * A client screen behind `Suspense`, like the products list and for the same
 * reason: every filter lives in the querystring and `useQueryStates` reads it
 * during render, which needs the boundary. Server-rendering would buy nothing
 * either - the listing is a POST, so Next would not cache it.
 */
export default function AdminOrdersPage() {
  return (
    <Suspense>
      <OrdersView />
    </Suspense>
  );
}
