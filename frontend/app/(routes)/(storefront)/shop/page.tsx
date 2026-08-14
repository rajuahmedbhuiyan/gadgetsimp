import type { Metadata } from "next";
import { Suspense } from "react";

import { container } from "@/components/home/section";
import { GridSkeleton } from "@/components/shop/product-grid";
import { ShopView } from "@/components/shop/shop-view";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse every gadget we stock - earbuds, smart watches, chargers, power banks and more, with fast delivery across Bangladesh.",
};

/**
 * The catalogue.
 *
 * A client page behind a `Suspense` boundary rather than a server render:
 * every filter lives in the querystring and the grid pages in as the shopper
 * scrolls, so the markup is a function of client state from the first
 * interaction onwards. `useQueryStates` reads the querystring during render,
 * which needs the boundary.
 *
 * The catalogue call is a POST, so it would not be cached by a server render
 * anyway - there is nothing lost by fetching it on the client, and the
 * infinite query keeps every page after the first there regardless.
 */
export default function ShopPage() {
  return (
    <Suspense fallback={<ShopFallback />}>
      <ShopView />
    </Suspense>
  );
}

function ShopFallback() {
  return (
    <div className={`${container} py-6 lg:py-10`}>
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight lg:text-3xl">
          Shop
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every gadget we stock, filtered however you like.
        </p>
      </header>
      <div className="flex gap-8">
        <div className="hidden w-64 shrink-0 lg:block xl:w-72" />
        <div className="min-w-0 flex-1">
          <GridSkeleton />
        </div>
      </div>
    </div>
  );
}
