import type { Metadata } from "next";

import { BrandsView } from "@/components/panel/brands/brands-view";

export const metadata: Metadata = { title: "Brands" };

export default function AdminBrandsPage() {
  return <BrandsView />;
}
