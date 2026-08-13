/**
 * The featured rail.
 *
 * A carousel rather than a grid: the curated set runs to two dozen items, and
 * two dozen cards stacked above the categories would push everything else
 * below the fold. Embla handles the drag and the snapping; the cards inside it
 * are still server components, passed through as children.
 *
 * `inStock: true` is part of the query on purpose - featuring something nobody
 * can buy is the fastest way to lose a shopper's trust in the whole row.
 */

import { getFeaturedProducts } from "@/lib/api/shop";
import { ProductCard } from "@/components/product/product-card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Section, SectionEmpty } from "./section";

/**
 * The rail's prev/next buttons.
 *
 * The default `outline` variant fills with `bg-background`, which is the same
 * colour as the section behind it - the arrows were effectively a thin ring on
 * nothing. A translucent `foreground` tint reads as a distinct disc in both
 * themes (dark on light, light on dark) without going opaque, and the blur
 * plus shadow lift it off whatever it happens to sit over.
 */
const arrowClass = [
  "hidden size-11 cursor-pointer rounded-full lg:flex",
  "border-border/70 bg-foreground/10 text-foreground shadow-card backdrop-blur-md",
  "transition-colors hover:border-brand hover:bg-brand hover:text-brand-foreground",
  // The `outline` variant ships its own `dark:` fill and hover. Those are
  // separate variants, so tailwind-merge keeps them and they win in dark mode
  // - the hover would land on `input/50` instead of brand. Restated here so
  // both themes render the same button.
  "dark:border-border/70 dark:bg-foreground/10 dark:hover:border-brand dark:hover:bg-brand",
  "disabled:opacity-30",
  // `!` because the button's base rule is `svg:not([class*='size-'])`, and an
  // attribute selector inside `:not()` out-specifies a plain `svg` descendant.
  "[&_svg]:size-5!",
].join(" ");

export async function FeaturedProducts() {
  const { items } = await getFeaturedProducts(12);

  return (
    <Section
      id="featured"
      eyebrow="Hand picked"
      title="Featured this week"
      description="The gadgets our team keeps recommending - all in stock and ready to ship today."
      href="/shop?featured=true"
    >
      {items.length === 0 ? (
        <SectionEmpty message="Nothing is featured right now. Check back soon." />
      ) : (
        <Carousel
          opts={{ align: "start", slidesToScroll: 1, containScroll: "trimSnaps" }}
          className="relative"
        >
          <CarouselContent className="-ml-3 lg:-ml-4">
            {items.map((product, index) => (
              <CarouselItem
                key={product.id}
                // Peeks the next card at every width, which is what tells the
                // shopper the row scrolls at all.
                className="basis-full pl-3 xs:basis-[46%] sm:basis-1/3 lg:basis-1/4 lg:pl-4 xl:basis-1/5"
              >
                <ProductCard product={product} priority={index < 5} />
              </CarouselItem>
            ))}
          </CarouselContent>

          {/* Pointer affordance only - touch users drag, and both get the
              keyboard arrows Embla binds to the container. */}
          {/* The offsets pull them in from the component's default -left-12 /
              -right-12, which would sit outside the page gutter. */}
          <CarouselPrevious className={`${arrowClass} -left-5`} />
          <CarouselNext className={`${arrowClass} -right-5`} />
        </Carousel>
      )}
    </Section>
  );
}
