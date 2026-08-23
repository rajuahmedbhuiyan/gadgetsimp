import type { MetadataRoute } from "next";

import { getCategories, getProducts } from "@/lib/api/shop";
import { absoluteUrl } from "@/lib/seo";

const PAGE_SIZE = 100;

type Frequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

function entry(
  path: string,
  {
    lastModified,
    changeFrequency,
    priority,
  }: {
    lastModified?: string | Date | null;
    changeFrequency: Frequency;
    priority: number;
  },
): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteUrl(path),
    lastModified: lastModified ? new Date(lastModified) : new Date(),
    changeFrequency,
    priority,
  };
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

async function allCategories() {
  const first = await getCategories({
    pagination: { page: 0, limit: PAGE_SIZE },
  });
  const totalPages = first.meta?.totalPages ?? 1;
  const rest =
    totalPages > 1
      ? await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) =>
            getCategories({
              pagination: { page: index + 1, limit: PAGE_SIZE },
            }),
          ),
        )
      : [];

  return [first, ...rest].flatMap((page) => page.items);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([
    allProducts(),
    allCategories(),
  ]);

  return [
    entry("/", { changeFrequency: "daily", priority: 1 }),
    entry("/shop", { changeFrequency: "daily", priority: 0.9 }),
    entry("/categories", { changeFrequency: "weekly", priority: 0.8 }),
    ...categories.map((category) =>
      entry(`/shop?category=${encodeURIComponent(category.slug)}`, {
        lastModified: category.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      }),
    ),
    ...products.map((product) =>
      entry(`/shop/${product.slug}`, {
        lastModified: product.updatedAt ?? product.publishedAt,
        changeFrequency: "weekly",
        priority: 0.85,
      }),
    ),
  ];
}
