/**
 * The catalogue card.
 *
 * A server component: the price, badges and image are markup, and only the two
 * actions on top of it cross into the client. That keeps a 30-product grid at
 * two small client components per card instead of thirty full ones.
 *
 * Every figure comes from the API. `discountPercent` and `originalPrice` are
 * server-computed, so nothing here recalculates a saving - a card that
 * disagrees with the product page is worse than one that shows less.
 */

import Image from "next/image";
import Link from "next/link";
import { ImageOff, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPrice, formatPriceRange } from "@/lib/format";
import type { ProductCard as ProductCardData } from "@/lib/api/shop";
import { Badge } from "@/components/ui/badge";
import { AddToCartButton } from "./add-to-cart-button";
import { WishlistButton } from "./wishlist-button";

export function ProductCard({
  product,
  priority = false,
  className,
}: {
  product: ProductCardData;
  /** Set on the first row so the largest contentful paint is not lazy-loaded. */
  priority?: boolean;
  className?: string;
}) {
  const { pricing, currency, originalPrice, discountPercent, inStock } = product;
  const onSale = discountPercent > 0 && originalPrice !== undefined;

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-all duration-300 hover:border-brand/40 hover:shadow-card-hover",
        className,
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-muted/40">
        <Link
          href={`/shop/${product.slug}`}
          // Stretched so the whole card is clickable while the buttons above
          // it stay independently tappable.
          className="absolute inset-0 z-10"
        >
          <span className="sr-only">{product.name}</span>
        </Link>

        {product.thumbnail?.src ? (
          <Image
            src={product.thumbnail.src}
            alt={product.thumbnail.alt || product.name}
            fill
            priority={priority}
            // Four across on desktop, two on mobile - tells the optimizer not
            // to ship a 1200px file for a 180px slot.
            sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 45vw"
            className={cn(
              "object-contain p-4 transition-transform duration-500 group-hover:scale-105",
              !inStock && "opacity-50 saturate-50",
            )}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" aria-hidden />
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            {onSale && (
              <Badge className="bg-sale text-sale-foreground">
                −{discountPercent}%
              </Badge>
            )}
            {product.featured && !onSale && (
              <Badge className="gap-1 bg-brand text-brand-foreground">
                <Star className="fill-current" aria-hidden />
                Featured
              </Badge>
            )}
          </div>

          <div className="pointer-events-auto">
            <WishlistButton
              productId={product.id}
              productName={product.name}
              className="opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-100"
            />
          </div>
        </div>

        {!inStock && (
          <div className="absolute inset-x-0 bottom-0 z-20 bg-background/85 py-1.5 text-center text-xs font-semibold backdrop-blur-sm">
            Out of stock
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        {product.brandId?.name && (
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {product.brandId.name}
          </p>
        )}

        <h3 className="line-clamp-2 text-sm leading-snug font-medium transition-colors group-hover:text-brand">
          {product.name}
        </h3>

        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-1">
          <span className="text-base font-bold text-price">
            {formatPriceRange(pricing.min, pricing.max, currency)}
          </span>
          {onSale && (
            <span className="text-xs text-muted-foreground line-through">
              {formatPrice(originalPrice, currency)}
            </span>
          )}
        </div>

        {/* Above the stretched link, so it receives its own clicks. */}
        <div className="relative z-20 pt-1">
          <AddToCartButton product={product} />
        </div>
      </div>
    </article>
  );
}
