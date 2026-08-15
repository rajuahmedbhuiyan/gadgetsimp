import type { Metadata } from "next";

import { PanelPlaceholder } from "@/components/panel/panel-placeholder";

export const metadata: Metadata = { title: "Categories" };

export default function AdminCategoriesPage() {
  return <PanelPlaceholder href="/admin/categories" />;
}
