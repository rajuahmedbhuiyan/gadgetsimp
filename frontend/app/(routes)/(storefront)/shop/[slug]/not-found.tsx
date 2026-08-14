import Link from "next/link";
import { PackageX, Search } from "lucide-react";

import { container } from "@/components/home/section";
import { Button } from "@/components/ui/button";

/**
 * A slug that is not a product.
 *
 * Most often a category slug typed into the product route, or a product that
 * has since been withdrawn, so both routes out are offered rather than a bare
 * "404".
 */
export default function ProductNotFound() {
  return (
    <div
      className={`${container} flex flex-1 flex-col items-center justify-center py-20 text-center`}
    >
      <span className="mb-5 flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <PackageX className="size-8" aria-hidden />
      </span>

      <h1 className="font-heading text-2xl font-bold tracking-tight lg:text-3xl">
        We could not find that product
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        It may have sold out and been withdrawn, or the link may be pointing at
        a category rather than a single item.
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button
          className="h-12 cursor-pointer gap-2 rounded-field px-6 text-sm font-semibold"
          render={<Link href="/shop" />}
        >
          <Search className="size-4" aria-hidden />
          Browse the shop
        </Button>
        <Button
          variant="outline"
          className="h-12 cursor-pointer rounded-field px-6 text-sm font-semibold"
          render={<Link href="/" />}
        >
          Back to home
        </Button>
      </div>
    </div>
  );
}
