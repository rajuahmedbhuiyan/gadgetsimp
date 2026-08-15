import type { Metadata } from "next";

import { PanelPlaceholder } from "@/components/panel/panel-placeholder";

export const metadata: Metadata = { title: "Orders" };

export default function AdminOrdersPage() {
  return <PanelPlaceholder href="/admin/orders" />;
}
