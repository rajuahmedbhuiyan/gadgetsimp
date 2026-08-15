import type { Metadata } from "next";

import { PanelPlaceholder } from "@/components/panel/panel-placeholder";

export const metadata: Metadata = { title: "Products" };

export default function AdminProductsPage() {
  return <PanelPlaceholder href="/admin/products" />;
}
