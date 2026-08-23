/**
 * The category tiles.
 *
 * `showInHome: true` is the curated set. The API additionally hides any
 * category with nothing to sell across its whole subtree, so a tile here
 * always leads to a populated grid - no client-side filtering needed.
 *
 * Tiles link to `/shop?category=<slug>`, not `/shop/<slug>`: that path is the
 * product route, and a category slug 404s against it.
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Layers3, PackageSearch } from "lucide-react";

import { getHomeCategories } from "@/lib/api/shop";
import type { ShopCategory } from "@/lib/api/shop";
import { cn } from "@/lib/utils";
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
        <ul className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-6">
          {items.map((category) => (
            <li key={category.id} className="min-w-0">
              <CategoryTile category={category} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function CategoryTile({ category }: { category: ShopCategory }) {
  return (
    <Link
      href={`/shop?category=${category.slug}`}
      className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="relative flex aspect-[4/3] min-w-0 items-center justify-center overflow-hidden bg-muted/35">
        {category.image ? (
          <Image
            src={category.image}
            // The tile text names the category; repeating it as alt is noise.
            alt=""
            fill
            sizes="(min-width: 1280px) 180px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-contain p-5 transition-transform duration-300 group-hover:scale-110"
          />
        ) : (
          <span className="flex size-14 items-center justify-center rounded-full bg-background/80 text-muted-foreground ring-1 ring-border">
            <Layers3 className="size-6" aria-hidden />
          </span>
        )}

        <span
          className={cn(
            "absolute right-2 top-2 flex size-8 items-center justify-center rounded-full",
            "bg-background/95 text-muted-foreground opacity-0 shadow-sm ring-1 ring-border",
            "transition-opacity group-hover:opacity-100",
          )}
        >
          <PackageSearch className="size-4" aria-hidden />
        </span>
      </span>

      <span className="flex min-w-0 flex-1 items-center justify-between gap-2 p-3">
        <span className="min-w-0 truncate text-sm font-semibold transition-colors group-hover:text-brand">
          {category.name}
        </span>
        <ArrowRight
          className="size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-brand"
          aria-hidden
        />
      </span>
    </Link>
  );
}
