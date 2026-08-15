import type { Metadata } from "next";
import { Suspense } from "react";

import { ProductsView } from "@/components/panel/products/products-view";

export const metadata: Metadata = { title: "Products" };

/**
 * The catalogue list.
 *
 * A client screen behind `Suspense`: every filter lives in the querystring and
 * `useQueryStates` reads it during render, which needs the boundary. Nothing
 * here could be server-rendered usefully anyway - the listing is a POST, so
 * Next would not cache it either.
 */
export default function AdminProductsPage() {
  return (
    <Suspense>
      <ProductsView />
    </Suspense>
  );
}
