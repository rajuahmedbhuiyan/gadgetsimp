import type { Metadata } from "next";

import { ProductFormScreen } from "@/components/panel/products/product-form-screen";

export const metadata: Metadata = { title: "Edit product" };

/**
 * One product's editor - the same form the create screen uses, loaded with a
 * record and saving a tab at a time.
 */
export default async function EditProductPage(
  props: PageProps<"/admin/products/[id]">,
) {
  const { id } = await props.params;
  return <ProductFormScreen id={id} />;
}
