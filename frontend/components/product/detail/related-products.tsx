/**
 * The full-width related rail at the bottom of a product page.
 *
 * Starts where the sidebar list stops. Both read the same category with the
 * same filters, so without `skip` the rail would be six identical cards to the
 * ones already a few hundred pixels to the right - which is why it takes an
 * offset rather than just a different limit.
 *
 * Renders nothing when the category has nothing left to show, so a small
 * category degrades to just the sidebar rather than to an empty heading.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { getRelatedProducts, type ProductDetail } from "@/lib/api/shop";
import { ProductCard } from "@/components/product/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCardSkeleton } from "@/components/product/product-card-skeleton";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const arrowClass = [
  "hidden size-11 cursor-pointer rounded-full lg:flex",
  "border-border/70 bg-foreground/10 text-foreground shadow-card backdrop-blur-md",
  "transition-colors hover:border-brand hover:bg-brand hover:text-brand-foreground",
  "dark:border-border/70 dark:bg-foreground/10 dark:hover:border-brand dark:hover:bg-brand",
  "disabled:opacity-30",
  "[&_svg]:size-5!",
].join(" ");

export async function RelatedProducts({
  product,
  /** How many the sidebar already showed, so this row continues past them. */
  skip = 0,
}: {
  product: ProductDetail;
  skip?: number;
}) {
  const category = product.categoryIds[0];
  const { items } = await getRelatedProducts(
    category?.slug,
    product.id,
    10,
    skip,
  );

  if (items.length === 0) return null;

  return (
    <section className="border-t pt-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight lg:text-2xl">
            You might also like
          </h2>
          {category?.name ? (
            <p className="mt-1 text-sm text-muted-foreground">
              More from {category.name}
            </p>
          ) : null}
        </div>

        {category?.slug ? (
          <Link
            href={`/shop?category=${category.slug}`}
            className="group inline-flex items-center gap-1.5 rounded-field text-sm font-semibold text-brand-foreground transition-colors hover:text-foreground dark:text-brand"
          >
            View all
            <ArrowRight
              className="size-4 transition-transform duration-200 group-hover:translate-x-1"
              aria-hidden
            />
          </Link>
        ) : null}
      </div>

      <Carousel
        opts={{ align: "start", slidesToScroll: 1, containScroll: "trimSnaps" }}
        className="relative"
      >
        <CarouselContent className="-ml-3 lg:-ml-4">
          {items.map((related) => (
            <CarouselItem
              key={related.id}
              className="basis-full pl-3 xs:basis-[46%] sm:basis-1/3 lg:basis-1/4 lg:pl-4 xl:basis-1/5"
            >
              <ProductCard product={related} />
            </CarouselItem>
          ))}
        </CarouselContent>

        <CarouselPrevious className={`${arrowClass} -left-5`} />
        <CarouselNext className={`${arrowClass} -right-5`} />
      </Carousel>
    </section>
  );
}

export function RelatedProductsSkeleton() {
  return (
    <section className="border-t pt-10">
      <div className="mb-6 flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="flex gap-3 overflow-hidden lg:gap-4">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="w-full shrink-0 xs:w-[46%] sm:w-1/3 lg:w-1/4 xl:w-1/5"
          >
            <ProductCardSkeleton />
          </div>
        ))}
      </div>
    </section>
  );
}
