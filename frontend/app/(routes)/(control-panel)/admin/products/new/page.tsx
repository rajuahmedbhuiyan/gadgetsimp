import type { Metadata } from "next";

import { ProductFormScreen } from "@/components/panel/products/product-form-screen";

export const metadata: Metadata = { title: "New product" };

export default function NewProductPage() {
  return <ProductFormScreen />;
}
