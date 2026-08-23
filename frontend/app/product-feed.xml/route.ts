import { getProducts } from "@/lib/api/shop";
import { contact, siteConfig } from "@/lib/config/site";
import { cleanText, absoluteUrl } from "@/lib/seo";

const PAGE_SIZE = 100;

function xml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function allProducts() {
  const first = await getProducts({
    pagination: { page: 0, limit: PAGE_SIZE },
    sort: { field: "createdAt", direction: "desc" },
  });
  const totalPages = first.meta?.totalPages ?? 1;
  const rest =
    totalPages > 1
      ? await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) =>
            getProducts({
              pagination: { page: index + 1, limit: PAGE_SIZE },
              sort: { field: "createdAt", direction: "desc" },
            }),
          ),
        )
      : [];

  return [first, ...rest].flatMap((page) => page.items);
}

export async function GET() {
  const products = await allProducts();

  const items = products
    .map((product) => {
      const price = product.pricing?.min ?? product.sellingPrice;
      const image = product.thumbnail?.src;
      const description =
        cleanText(product.shortDescription, 5000) ||
        `${product.name} from ${siteConfig.name}.`;

      return `
        <item>
          <g:id>${xml(product.id)}</g:id>
          <g:title>${xml(product.name)}</g:title>
          <g:description>${xml(description)}</g:description>
          <g:link>${xml(absoluteUrl(`/shop/${product.slug}`))}</g:link>
          ${image ? `<g:image_link>${xml(image)}</g:image_link>` : ""}
          <g:availability>${product.inStock ? "in_stock" : "out_of_stock"}</g:availability>
          <g:price>${xml(`${price.toFixed(2)} ${product.currency}`)}</g:price>
          <g:condition>new</g:condition>
          <g:brand>${xml(product.brandId?.name ?? siteConfig.name)}</g:brand>
        </item>`;
    })
    .join("");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xml(siteConfig.name)} product feed</title>
    <link>${xml(siteConfig.url)}</link>
    <description>${xml(siteConfig.description)}</description>
    <webMaster>${xml(contact.email)}</webMaster>
    ${items}
  </channel>
</rss>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
