import type { Metadata } from "next";

import { CategoriesPage } from "@/components/categories/categories-page";
import { getAllCategories } from "@/lib/api/shop";

export const metadata: Metadata = {
  title: "Categories",
  description:
    "Browse GadgetSimp categories and jump straight to phones, audio, chargers, accessories and more.",
};

export default async function PublicCategoriesPage() {
  const { items, meta } = await getAllCategories();

  return <CategoriesPage categories={items} total={meta?.total ?? items.length} />;
}
