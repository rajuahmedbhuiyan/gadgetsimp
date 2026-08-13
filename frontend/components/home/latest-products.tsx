/**
 * The main catalogue grid - 30 products, everything not already featured.
 *
 * `featured: false` keeps it from repeating the rail higher up the page;
 * showing the same six cards twice is what makes a home page feel thin.
 *
 * Thirty cards is a lot of DOM, so nothing here is a client component except
 * the two buttons on each card.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { getLatestProducts } from "@/lib/api/shop";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import { Section, SectionEmpty } from "./section";

export async function LatestProducts() {
  const { items } = await getLatestProducts(20);

  return (
    <Section
      id="products"
      eyebrow="Fresh stock"
      title="New in the shop"
      description="The latest additions to the catalogue, newest first."
      href="/shop"
      linkLabel="Browse everything"
    >
      {items.length === 0 ? (
        <SectionEmpty message="No products to show yet. Please try again in a moment." />
      ) : (
        <>
          {/* No scroll-reveal here, deliberately. A reveal starts the tiles at
              `opacity: 0` in the server HTML and only clears it once an
              IntersectionObserver fires - so a grid this tall could stay
              invisible on a phone, and stays invisible for good if the JS
              never lands. Products are the page's content; they do not get to
              depend on that. The cards still animate on hover. */}
          <ul className="grid grid-cols-1 gap-3 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-5">
            {items.map((product) => (
              <li key={product.id} className="h-full">
                <ProductCard product={product} />
              </li>
            ))}
          </ul>

          <div className="mt-10 flex justify-center">
            <Button
              size="lg"
              className="h-12 cursor-pointer gap-2 px-8"
              render={<Link href="/shop" />}
            >
              Visit Shop
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </>
      )}
    </Section>
  );
}
