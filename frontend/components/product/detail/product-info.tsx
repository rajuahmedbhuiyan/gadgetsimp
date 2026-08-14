/**
 * Everything above and below the buy panel that is plain reading: the
 * breadcrumb, the title block, the description and the spec table.
 *
 * All server components - none of it changes after render, so none of it needs
 * to cross into the client bundle.
 */

import Link from "next/link";
import { ChevronRight, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { humanise } from "@/lib/format";
import type { AttributeGroup, CategoryRef, ProductDetail } from "@/lib/api/shop";
import { Badge } from "@/components/ui/badge";
import { RichText } from "./rich-text";

/**
 * Home / Shop / Category / Product.
 *
 * The category segment walks `categoryIds[0].path`, which the API returns
 * root-to-leaf, so a nested category shows its whole trail. Each links to the
 * filtered listing - a category slug is not a product and 404s on `/shop/…`.
 */
export function ProductBreadcrumb({
  category,
  productName,
}: {
  category?: CategoryRef;
  productName: string;
}) {
  const trail = category?.path?.length
    ? category.path
    : category
      ? [category]
      : [];

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Crumb href="/">Home</Crumb>
        <Separator />
        <Crumb href="/shop">Shop</Crumb>

        {trail.map((step) => (
          <li key={step.id} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden />
            <Link
              href={`/shop?category=${step.slug}`}
              className="rounded transition-colors hover:text-brand-foreground dark:hover:text-brand"
            >
              {step.name}
            </Link>
          </li>
        ))}

        <li className="flex min-w-0 items-center gap-1">
          <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden />
          <span
            aria-current="page"
            className="truncate font-medium text-foreground"
          >
            {productName}
          </span>
        </li>
      </ol>
    </nav>
  );
}

function Crumb({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="rounded transition-colors hover:text-brand-foreground dark:hover:text-brand"
      >
        {children}
      </Link>
    </li>
  );
}

function Separator() {
  return <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden />;
}

/** Brand, name and the one-line summary, above the price. */
export function ProductHeading({ product }: { product: ProductDetail }) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {product.brandId?.name ? (
          <Link
            href={`/shop?brand=${product.brandId.slug}`}
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase transition-colors hover:text-brand-foreground dark:hover:text-brand"
          >
            {product.brandId.name}
          </Link>
        ) : null}
        {product.featured ? (
          <Badge className="gap-1 bg-brand text-brand-foreground">
            <Star className="fill-current" aria-hidden />
            Featured
          </Badge>
        ) : null}
      </div>

      <h1 className="font-heading text-2xl leading-tight font-bold tracking-tight text-balance lg:text-3xl">
        {product.name}
      </h1>

      {product.shortDescription ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {product.shortDescription}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The spec table: one card, every group titled.
 *
 * A card per group left a product with three two-row groups looking like three
 * mostly-empty boxes, so it is one card now - but the titles stay. `Highlights`
 * and `Details` are how the merchandiser chose to divide the specs, and
 * dropping them turned two labelled sets into one undifferentiated list.
 *
 * So: one card, a small heading per group, rows underneath it. The API returns
 * the groups in display order and they are rendered in that order.
 */
export function ProductSpecs({
  attributes,
  className,
}: {
  attributes: AttributeGroup[];
  className?: string;
}) {
  const groups = attributes.filter(
    (group) => Object.keys(group.options ?? {}).length > 0,
  );

  if (groups.length === 0) return null;

  return (
    <section className={cn("rounded-xl border bg-card p-5 sm:p-6", className)}>
      <h1 className="mb-5 text-sm font-semibold">Specifications</h1>

      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.title}>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-brand-foreground uppercase dark:text-brand">
              {group.title}
            </h2>

            <dl className="divide-y border-t">
              {Object.entries(group.options).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-start justify-between gap-6 py-3 text-sm"
                >
                  <dt className="shrink-0 text-muted-foreground">
                    {humanise(key)}
                  </dt>
                  <dd className="min-w-0 text-right font-medium">
                    <SpecValue value={value} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function SpecValue({
  value,
}: {
  value: string | number | boolean | (string | number)[];
}) {
  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap justify-end gap-2">
        {value.map((entry) => (
          <span
            key={String(entry)}
            className="rounded-md bg-muted px-2 py-1 text-xs"
          >
            {humanise(String(entry))}
          </span>
        ))}
      </span>
    );
  }

  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (typeof value === "number") return <>{value.toLocaleString("en-US")}</>;
  return <>{humanise(value)}</>;
}

/**
 * The long description, kept out of the fold-height buy panel.
 *
 * Stored as HTML by the admin editor, so the body goes through `RichText`,
 * which sanitises before it is injected - see the note there on why that is
 * not optional.
 */
export function ProductDescription({ product }: { product: ProductDetail }) {
  if (!product.description) return null;

  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold">About this product</h2>
      <RichText html={product.description} />

      {product.tags.length > 0 ? (
        <ul className="mt-5 flex flex-wrap gap-1.5">
          {product.tags.map((tag) => (
            <li key={tag}>
              <Link
                href={`/shop?search=${encodeURIComponent(tag)}`}
                className="inline-block rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-brand/15 hover:text-brand-foreground dark:hover:text-brand"
              >
                {humanise(tag)}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
