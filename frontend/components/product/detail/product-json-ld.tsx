import { contact, siteConfig } from "@/lib/config/site";
import { formatPrice } from "@/lib/format";
import type { CategoryRef, ProductDetail } from "@/lib/api/shop";
import { absoluteUrl, cleanText, jsonLd } from "@/lib/seo";

function availabilityFor(product: ProductDetail) {
  const hasBuyableVariant =
    product.productType === "VARIABLE" &&
    product.variations.some((variation) => variation.stock.status === "IN_STOCK");

  if (product.stock.status === "IN_STOCK" || hasBuyableVariant) {
    return "https://schema.org/InStock";
  }
  if (product.stock.allowBackorder) return "https://schema.org/BackOrder";
  return "https://schema.org/OutOfStock";
}

function productImages(product: ProductDetail) {
  return [
    product.thumbnail?.src,
    ...product.images.map((image) => image.src),
    ...product.variations.map((variation) => variation.image?.src),
  ].filter((src, index, all): src is string => Boolean(src) && all.indexOf(src) === index);
}

function breadcrumbItems(category: CategoryRef | undefined, product: ProductDetail) {
  const trail = category?.path?.length
    ? category.path
    : category
      ? [category]
      : [];

  return [
    { name: "Home", url: absoluteUrl("/") },
    { name: "Shop", url: absoluteUrl("/shop") },
    ...trail.map((step) => ({
      name: step.name,
      url: absoluteUrl(`/shop?category=${encodeURIComponent(step.slug)}`),
    })),
    { name: product.name, url: absoluteUrl(`/shop/${product.slug}`) },
  ];
}

export function ProductJsonLd({ product }: { product: ProductDetail }) {
  const url = absoluteUrl(`/shop/${product.slug}`);
  const images = productImages(product);
  const prices = [
    product.sellingPrice,
    ...product.variations.map((variation) => variation.sellingPrice),
  ].filter((price) => Number.isFinite(price));
  const lowPrice = Math.min(...prices);
  const sku = product.sku || product.variations[0]?.sku || product.id;

  const productData = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.name,
    description: cleanText(product.description || product.shortDescription, 5000),
    image: images.length > 0 ? images : undefined,
    sku,
    brand: product.brandId?.name
      ? { "@type": "Brand", name: product.brandId.name }
      : { "@type": "Brand", name: siteConfig.name },
    category: product.categoryIds[0]?.name,
    url,
    offers: {
      "@type": "Offer",
      url,
      price: lowPrice,
      priceCurrency: product.currency,
      availability: availabilityFor(product),
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: siteConfig.name,
        url: siteConfig.url,
      },
    },
  };

  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems(product.categoryIds[0], product).map(
      (item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: item.url,
      }),
    ),
  };

  const organizationData = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${siteConfig.url}#store`,
    name: siteConfig.name,
    url: siteConfig.url,
    email: contact.email,
    telephone: contact.phone,
    areaServed: "BD",
    priceRange: formatPrice(lowPrice, product.currency),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(productData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(organizationData) }}
      />
    </>
  );
}
