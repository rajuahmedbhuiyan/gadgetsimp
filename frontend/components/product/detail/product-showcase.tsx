"use client";

/**
 * Gallery and buy panel, and the variant selection they share.
 *
 * These are one component because they are one decision: choosing a colour
 * changes the price *and* the photo. Splitting them would mean lifting the
 * same state into a context for exactly two consumers sitting side by side.
 *
 * The heading arrives as a slot rather than being rendered here, so it stays a
 * server component - it is static text, and the `h1` should not be in the
 * client bundle just because its neighbours are.
 */

import { useMemo, useState, type ReactNode } from "react";

import type { Media, ProductDetail, Variation } from "@/lib/api/shop";
import { ProductGallery } from "./product-gallery";
import { PurchasePanel } from "./purchase-panel";

export function ProductShowcase({
  product,
  heading,
}: {
  product: ProductDetail;
  heading: ReactNode;
}) {
  /**
   * Preselect the first buyable SKU.
   *
   * A VARIABLE product with nothing chosen cannot be added to the cart, so
   * landing on "Choose an option" when there is an obvious default is a step
   * for its own sake. Falling back to the first variation keeps a fully
   * sold-out product selectable, so the panel can explain itself.
   */
  const [variant, setVariant] = useState<Variation | null>(() => {
    if (product.productType !== "VARIABLE") return null;
    return (
      product.variations.find((v) => v.stock.status === "IN_STOCK") ??
      product.variations[0] ??
      null
    );
  });

  /**
   * Gallery order: the chosen variant's photo first, then the thumbnail, then
   * the gallery. Deduplicated by `src`, because the catalogue reuses the same
   * file across a product and its variants and a repeated frame reads as a
   * broken carousel.
   */
  const images = useMemo(() => {
    const ordered: Media[] = [
      ...(variant?.image ? [variant.image] : []),
      ...(product.thumbnail ? [product.thumbnail] : []),
      ...product.images,
    ];

    const seen = new Set<string>();
    return ordered.filter((image) => {
      if (!image?.src || seen.has(image.src)) return false;
      seen.add(image.src);
      return true;
    });
  }, [variant, product.thumbnail, product.images]);

  const [active, setActive] = useState(0);

  /*
   * Explicit grid placement rather than two copies of the heading hidden at
   * different breakpoints: the heading holds the page's only `h1`, and
   * duplicating it would put two in the document.
   *
   *   mobile  - heading, gallery, panel, in source order
   *   ≥1024px - gallery down the left spanning both rows, heading above the
   *             panel on the right
   */
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-12">
      {/* `mb-0` on mobile: the heading block carries its own bottom margin for
          the desktop column, which doubles up with the grid gap when it is
          stacked directly above the image. */}
      <div className="[&>div]:mb-0 lg:col-start-2 lg:row-start-1 lg:[&>div]:mb-6">
        {heading}
      </div>

      <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <ProductGallery
          images={images}
          active={Math.min(active, Math.max(0, images.length - 1))}
          onActiveChange={setActive}
          productName={product.name}
        />
      </div>

      <div className="lg:col-start-2 lg:row-start-2">
        <PurchasePanel
          product={product}
          selected={variant}
          onSelectVariant={(next) => {
            setVariant(next);
            // The new variant's photo is index 0 of the reordered list.
            setActive(0);
          }}
        />
      </div>
    </div>
  );
}
