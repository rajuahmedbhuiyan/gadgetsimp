"use client";

/**
 * The add-to-cart action on a product card.
 *
 * Three outcomes, decided by the catalogue rather than by the UI:
 *
 *  - **Out of stock** — disabled. The API refuses these, so offering the
 *    button would only produce a 422 the shopper cannot act on.
 *  - **VARIABLE** — navigates to the product page. A variable product is a
 *    family of SKUs; adding one without saying which leaves the warehouse
 *    guessing, and the API requires `variantId` for exactly that reason.
 *  - **SIMPLE and in stock** — adds one, right here, to the server cart or the
 *    local one depending on whether anyone is signed in.
 */

import { useRouter } from "next/navigation";
import { Check, Loader2, Settings2, ShoppingCart } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAddToCart } from "@/hooks/use-add-to-cart";
import { Button } from "@/components/ui/button";
import type { ProductCard } from "@/lib/api/shop";

export function AddToCartButton({
  product,
  className,
}: {
  product: ProductCard;
  className?: string;
}) {
  const router = useRouter();
  const { mutate, isPending, isSuccess } = useAddToCart();

  const base = cn("h-9 w-full gap-1.5 text-xs font-semibold", className);

  if (!product.inStock) {
    return (
      <Button variant="secondary" disabled className={base}>
        Out of stock
      </Button>
    );
  }

  if (product.productType === "VARIABLE") {
    return (
      <Button
        variant="outline"
        className={base}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          router.push(`/shop/${product.slug}`);
        }}
      >
        <Settings2 className="size-3.5" aria-hidden />
        Choose options
      </Button>
    );
  }

  return (
    <Button
      className={base}
      disabled={isPending}
      onClick={(event) => {
        // The card is an anchor - do not let the tap navigate.
        event.preventDefault();
        event.stopPropagation();

        mutate({
          productId: product.id,
          quantity: 1,
          // Read only when signed out, where there is no API to price a line.
          snapshot: {
            name: product.name,
            slug: product.slug,
            thumbnail: product.thumbnail ?? null,
            productType: product.productType,
            currency: product.currency,
            unitPrice: product.sellingPrice,
            originalPrice: product.originalPrice ?? null,
            variantLabel: null,
            variantSku: null,
            maxQuantity: null,
          },
        });
      }}
    >
      {isPending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : isSuccess ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <ShoppingCart className="size-3.5" aria-hidden />
      )}
      {isPending ? "Adding…" : isSuccess ? "Added" : "Add to cart"}
    </Button>
  );
}
