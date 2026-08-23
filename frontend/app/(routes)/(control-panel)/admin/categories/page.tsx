import type { Metadata } from "next";

import { CategoriesView } from "@/components/panel/categories/categories-view";

export const metadata: Metadata = { title: "Categories" };

export default function AdminCategoriesPage() {
  return <CategoriesView />;
}
