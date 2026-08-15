import type { Metadata } from "next";

import { PanelPlaceholder } from "@/components/panel/panel-placeholder";

export const metadata: Metadata = { title: "Brands" };

export default function AdminBrandsPage() {
  return <PanelPlaceholder href="/admin/brands" />;
}
