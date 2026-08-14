import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { container } from "@/components/home/section";
import { OrderDetailView } from "@/components/orders/order-detail-view";

export const metadata: Metadata = {
  title: "Order",
  robots: { index: false, follow: false },
};

/**
 * One order, tracking first.
 *
 * The segment is the order's **integer** id, which is what `GET /orders/{id}`
 * takes - not the six-digit `orderNumber` the customer quotes on the phone.
 * Anything that is not a number is rejected here rather than becoming a
 * request the API would answer 404 to anyway.
 */
export default async function OrderPage(props: PageProps<"/orders/[id]">) {
  const { id } = await props.params;
  const orderId = Number(id);

  if (!Number.isInteger(orderId) || orderId <= 0) notFound();

  return (
    <div className={`${container} py-6 lg:py-10`}>
      <OrderDetailView id={orderId} />
    </div>
  );
}
