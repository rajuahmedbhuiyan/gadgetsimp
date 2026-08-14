/**
 * Six more from the same category, as a compact list beside the details.
 *
 * A narrow column, so these are rows rather than cards: a thumbnail, a name
 * and a price is all that fits at this width, and it is all a shopper needs to
 * decide whether to click. The full card treatment belongs in a grid.
 *
 * Streams behind its own `<Suspense>`, and renders nothing when the category
 * has nothing else to offer.
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ImageOff } from "lucide-react";

import { formatPriceRange } from "@/lib/format";
import { getRelatedProducts, type ProductDetail } from "@/lib/api/shop";
import { Skeleton } from "@/components/ui/skeleton";

/** Also the offset the bottom rail starts from, so the two never overlap. */
export const RELATED_ASIDE_COUNT = 4;

export async function RelatedAside({ product }: { product: ProductDetail }) {
  const category = product.categoryIds[0];
  const { items } = await getRelatedProducts(category?.slug, product.id, RELATED_ASIDE_COUNT);

  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold">Related Products</h2>

      <ul className="divide-y">
        {items.map((related) => (
          <li key={related.id}>
            <Link
              href={`/shop/${related.slug}`}
              className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted"
            >
              <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted/40">
                {related.thumbnail?.src ? (
                  <Image
                    src={related.thumbnail.src}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-contain p-1 transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-muted-foreground">
                    <ImageOff className="size-4" aria-hidden />
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm leading-snug font-medium transition-colors group-hover:text-brand">
                  {related.name}
                </span>
                <span className="mt-1 block text-sm font-semibold text-price">
                  {formatPriceRange(
                    related.pricing.min,
                    related.pricing.max,
                    related.currency,
                  )}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {category?.slug ? (
        <Link
          href={`/shop?category=${category.slug}`}
          className="group mt-4 flex items-center gap-1.5 border-t pt-4 text-sm font-medium text-brand-foreground transition-colors hover:text-foreground dark:text-brand"
        >
          See all in {category.name}
          <ArrowRight
            className="size-4 transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden
          />
        </Link>
      ) : null}
    </section>
  );
}

export function RelatedAsideSkeleton() {
  return (
    <section className="rounded-xl border bg-card p-5">
      <Skeleton className="mb-4 h-4 w-32" />
      <ul className="divide-y">
        {Array.from({ length: RELATED_ASIDE_COUNT }, (_, index) => (
          <li key={index} className="flex items-center gap-3 py-3">
            <Skeleton className="size-14 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-16" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
