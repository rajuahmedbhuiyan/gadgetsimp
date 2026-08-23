import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getProduct } from "@/lib/api/shop";
import { siteConfig } from "@/lib/config/site";
import { container } from "@/components/home/section";
import {
  ProductBreadcrumb,
  ProductDescription,
  ProductHeading,
  ProductSpecs,
} from "@/components/product/detail/product-info";
import { ProductShowcase } from "@/components/product/detail/product-showcase";
import {
  RelatedAside,
  RelatedAsideSkeleton,
  RELATED_ASIDE_COUNT,
} from "@/components/product/detail/related-aside";
import {
  RelatedProducts,
  RelatedProductsSkeleton,
} from "@/components/product/detail/related-products";
import { SectionTabs } from "@/components/product/detail/section-tabs";

const SECTIONS = [
  { id: "specifications", label: "Specifications" },
  { id: "description", label: "Description" },
];

/**
 * Titles and share cards come from the product's own `seo` block where the
 * merchandiser filled one in, and fall back to the product itself otherwise -
 * the API derives missing SEO fields from the stored record anyway.
 *
 * Next dedupes this fetch against the one in the page body, so asking for the
 * product twice costs one request.
 */
export async function generateMetadata(
  props: PageProps<"/shop/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getProduct(slug);

  if (!product) return { title: "Product not found" };

  const title = product.seo?.title || product.name;
  const description =
    product.seo?.description ||
    product.shortDescription ||
    // The stored description is HTML; strip it before it becomes a meta tag.
    product.description?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  const image = product.thumbnail?.src ?? product.images[0]?.src;

  return {
    title,
    description,
    keywords: product.seo?.keywords ?? product.tags,
    alternates: { canonical: `/shop/${product.slug}` },
    openGraph: {
      type: "website",
      title,
      description,
      url: `${siteConfig.url}/shop/${product.slug}`,
      images: image ? [{ url: image, alt: product.name }] : undefined,
    },
  };
}

/**
 * Deliberately no `loading.tsx` beside this file.
 *
 * A `loading.tsx` wraps the route in a Suspense boundary, which lets Next
 * flush the shell - and commit a `200` - before this component has run. The
 * `notFound()` below would then render the not-found UI under a 200 status,
 * so every withdrawn product and mistyped slug would look like a real page to
 * a crawler. Verified: with a `loading.tsx` present these routes answered 200;
 * without it they answer 404.
 *
 * Nothing is lost by waiting, because there is no product page without the
 * product. The one part that can be deferred - the related list - has its own
 * boundary below.
 */
export default async function ProductPage(props: PageProps<"/shop/[slug]">) {
  const { slug } = await props.params;
  const product = await getProduct(slug);

  // `null` covers both "no such product" and "this slug is a category" - only
  // products are addressed on this route.
  if (!product) notFound();

  return (
    <div className={`${container} pt-6 pb-28 lg:py-10`}>
      <ProductBreadcrumb
        category={product.categoryIds[0]}
        productName={product.name}
      />

      <ProductShowcase
        product={product}
        heading={<ProductHeading product={product} />}
      />

      <div className="mt-12 lg:mt-16">
        <SectionTabs sections={SECTIONS} />

        <div className="grid gap-8 lg:grid-cols-[1.9fr_1fr]">
          <div className="flex flex-col gap-8">
            {/* `scroll-mt` clears the sticky header and the tab rail above it,
                so a jump lands with the heading visible rather than tucked
                under them. */}
            <div id="specifications" className="scroll-mt-40">
              <ProductSpecs attributes={product.attributes} />
            </div>

            <div id="description" className="scroll-mt-40">
              <ProductDescription product={product} />
            </div>
          </div>

          {/* Streams separately, so a second catalogue call never delays the
              product the shopper actually asked for. */}
          <aside className="lg:sticky lg:top-40 lg:self-start">
            <Suspense fallback={<RelatedAsideSkeleton />}>
              <RelatedAside product={product} />
            </Suspense>
          </aside>
        </div>
      </div>

      {/* Continues past the six in the sidebar rather than repeating them. */}
      <div className="mt-14 lg:mt-20">
        <Suspense fallback={<RelatedProductsSkeleton />}>
          <RelatedProducts product={product} skip={RELATED_ASIDE_COUNT} />
        </Suspense>
      </div>
    </div>
  );
}
