"use client";

/**
 * Loads what the product form needs, then renders it.
 *
 * Split from `ProductForm` so that component takes plain data and can be
 * rendered from either screen - and so the loading and not-found states live
 * in one place rather than being repeated by create and edit.
 */

import Link from "next/link";

import {
  useAdminProduct,
  useTaxonomy,
} from "@/hooks/use-admin-products";
import { PanelPageHeading } from "@/components/panel/page-heading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductForm } from "./product-form";

export function ProductFormScreen({ id }: { id?: string }) {
  const { leaves, brands, isLoading: loadingTaxonomy } = useTaxonomy();
  const { product, isLoading: loadingProduct, isError } = useAdminProduct(id);

  if (loadingTaxonomy || loadingProduct) return <FormSkeleton />;

  if (id && (isError || !product)) {
    return (
      <>
        <PanelPageHeading title="Product not found" />
        <div className="mt-6 rounded-xl border border-dashed px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            This product may have been archived, or the link may be wrong.
          </p>
          <Button
            className="mt-6 h-10 cursor-pointer rounded-lg px-5 text-sm font-semibold"
            render={<Link href="/admin/products" />}
          >
            Back to products
          </Button>
        </div>
      </>
    );
  }

  return (
    <ProductForm
      // Remounts when the saved record changes, so every panel re-reads the
      // server's version rather than keeping a draft from before the save.
      key={product?.updatedAt ?? "new"}
      product={product ?? undefined}
      leaves={leaves}
      brands={brands}
    />
  );
}

function FormSkeleton() {
  return (
    <>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 h-4 w-40" />
      <Skeleton className="mt-4 h-11 w-full max-w-3xl rounded-lg" />
      <Skeleton className="mt-4 h-[28rem] w-full rounded-xl" />
    </>
  );
}
