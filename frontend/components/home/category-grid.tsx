/**
 * The category tiles.
 *
 * `showInHome: true` is the curated set. The API additionally hides any
 * category with nothing to sell across its whole subtree, so a tile here
 * always leads to a populated grid - no client-side filtering needed.
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Layers } from "lucide-react";

import { getHomeCategories } from "@/lib/api/shop";
import { Section, SectionEmpty } from "./section";

export async function CategoryGrid() {
  const { items } = await getHomeCategories(12);

  return (
    <Section
      id="categories"
      eyebrow="Browse"
      title="Shop by category"
      description="Twelve shelves, one shop. Start where you already know what you want."
      href="/categories"
      linkLabel="All categories"
      className="bg-muted/30"
    >
      {items.length === 0 ? (
        <SectionEmpty message="Categories are being set up. Please check back shortly." />
      ) : (
        /* Visible without JS - see the note in `latest-products.tsx`. */
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-6">
          {items.map((category) => (
            <li key={category.id}>
              <Link
                href={`/shop/${category.slug}`}
                className="group flex h-full flex-col items-center gap-3 rounded-xl border bg-card p-4 text-center transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="relative flex size-16 items-center justify-center overflow-hidden rounded-full bg-muted/60 transition-colors group-hover:bg-brand/10 lg:size-20">
                  {category.image ? (
                    <Image
                      src={category.image}
                      // The tile's own label names it; a duplicate alt would
                      // just be read out twice.
                      alt=""
                      fill
                      sizes="80px"
                      className="object-contain p-2.5 transition-transform duration-300 group-hover:scale-110"
                    />
                  ) : (
                    <Layers className="size-6 text-muted-foreground" aria-hidden />
                  )}
                </span>

                <span className="flex items-center justify-center gap-1 text-sm leading-snug font-medium text-balance transition-colors group-hover:text-brand">
                  {category.name}
                  <ArrowUpRight
                    className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
