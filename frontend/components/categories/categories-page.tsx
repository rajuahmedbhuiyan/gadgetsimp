import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Layers3, PackageSearch } from "lucide-react";

import { SectionEmpty, container } from "@/components/home/section";
import type { ShopCategory } from "@/lib/api/shop";
import { cn } from "@/lib/utils";

export function CategoriesPage({
  categories,
  total,
}: {
  categories: ShopCategory[];
  total: number;
}) {
  const [lead, ...rest] = categories;
  const visibleTotal = total || categories.length;
  const overflow = visibleTotal > categories.length;

  return (
    <div className="bg-background">
      <section className="border-b bg-muted/25 py-8 sm:py-10 lg:py-12">
        <div className={container}>
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-end">
            <div className="min-w-0">
              <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold tracking-wide text-brand-foreground uppercase dark:text-brand">
                Browse
              </span>
              <h1 className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Shop by category
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Find the right shelf first, then narrow by brand, price and stock.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-3">
              <Stat label="Categories" value={visibleTotal.toLocaleString("en-US")} />
              <Stat label="Available" value="In stock" />
            </div>
          </div>
        </div>
      </section>

      <section className="py-8 sm:py-10 lg:py-12">
        <div className={container}>
          {categories.length === 0 ? (
            <SectionEmpty message="Categories are being set up. Please check back shortly." />
          ) : (
            <div className="grid min-w-0 gap-4">
              {lead ? <LeadCategory category={lead} /> : null}

              <ul className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {rest.map((category) => (
                  <li key={category.id} className="min-w-0">
                    <CategoryCard category={category} />
                  </li>
                ))}
              </ul>

              {overflow ? (
                <p className="rounded-lg border border-dashed bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
                  Showing the first {categories.length.toLocaleString("en-US")} available
                  categories.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-xl font-semibold tracking-tight">
        {value}
      </p>
    </div>
  );
}

function LeadCategory({ category }: { category: ShopCategory }) {
  return (
    <Link
      href={`/shop?category=${category.slug}`}
      className="group grid min-w-0 overflow-hidden rounded-xl border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:grid-cols-[minmax(0,1fr)_260px]"
    >
      <div className="flex min-w-0 flex-col justify-between gap-8 p-5 sm:p-6">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand-foreground dark:text-brand">
            Featured shelf
          </span>
          <h2 className="mt-4 font-heading text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            {category.name}
          </h2>
        </div>

        <span className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-brand transition-colors group-hover:text-foreground">
          Browse products
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-1"
            aria-hidden
          />
        </span>
      </div>

      <CategoryVisual
        category={category}
        className="h-44 rounded-none border-t bg-muted/40 md:h-full md:border-t-0 md:border-l"
        imageClassName="object-contain p-8 transition-transform duration-300 group-hover:scale-105"
      />
    </Link>
  );
}

function CategoryCard({ category }: { category: ShopCategory }) {
  return (
    <Link
      href={`/shop?category=${category.slug}`}
      className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <CategoryVisual
        category={category}
        className="aspect-[4/3] bg-muted/35"
        imageClassName="object-contain p-5 transition-transform duration-300 group-hover:scale-110"
      />
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 p-3">
        <span className="min-w-0 truncate text-sm font-semibold">
          {category.name}
        </span>
        <ArrowRight
          className="size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-brand"
          aria-hidden
        />
      </div>
    </Link>
  );
}

function CategoryVisual({
  category,
  className,
  imageClassName,
}: {
  category: ShopCategory;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex min-w-0 items-center justify-center overflow-hidden",
        className,
      )}
    >
      {category.image ? (
        <Image
          src={category.image}
          alt=""
          fill
          sizes="(min-width: 1280px) 240px, (min-width: 768px) 25vw, 50vw"
          className={imageClassName}
        />
      ) : (
        <span className="flex size-16 items-center justify-center rounded-full bg-background/80 text-muted-foreground ring-1 ring-border">
          <Layers3 className="size-7" aria-hidden />
        </span>
      )}
      <span className="absolute right-3 top-3 rounded-full bg-background/90 p-2 text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity group-hover:opacity-100">
        <PackageSearch className="size-4" aria-hidden />
      </span>
    </span>
  );
}
