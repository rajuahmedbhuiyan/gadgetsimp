/**
 * The public storefront catalog.
 *
 * These endpoints need no session, so they are read on the server and the
 * markup ships with the page - no request waterfall, no spinner on first
 * paint. That is why this does not go through `lib/api/client.ts`: that client
 * reads the access token from `document.cookie` and renews through a
 * same-origin round trip, neither of which exists during a server render.
 *
 * Browsing is filtered with POST bodies rather than query strings (the filter
 * set is open-ended), which also means Next's fetch cache ignores them - only
 * GETs are cached. Sections are therefore wrapped in `<Suspense>` by their
 * callers so a slow catalog streams in instead of blocking the shell.
 */

import { unstable_rethrow } from "next/navigation";

import type { ApiEnvelope, PaginationMeta } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

/* --------------------------------- types -------------------------------- */

export type ProductType = "SIMPLE" | "VARIABLE";

export interface Media {
  alt: string;
  src: string;
  /** Absent when the image is a bare URL with no media record behind it. */
  id?: number;
}

export interface BrandRef {
  id: string;
  name: string;
  slug: string;
}

/**
 * The lightweight card shape `POST /shop` returns. No descriptions, no
 * attribute maps, no galleries - fetch `GET /shop/{slug}` for those.
 */
export interface ProductCard {
  id: string;
  name: string;
  slug: string;
  productType: ProductType;
  status: string;
  featured: boolean;
  currency: string;
  /** What the shopper pays. For a VARIABLE product, the lowest variant. */
  sellingPrice: number;
  /** Only present when the product is discounted. */
  originalPrice?: number;
  thumbnail?: Media | null;
  /** Populated reference, despite the `Id` suffix the API uses. */
  brandId?: BrandRef | null;
  /** A VARIABLE product spans a range; a SIMPLE one has min === max. */
  pricing: { min: number; max: number; currency: string };
  inStock: boolean;
  discountPercent: number;
}

/** The minimal tile shape `POST /shop/categories` returns. */
export interface ShopCategory {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  image: string | null;
  showInHome: boolean;
  sortOrder: number;
}

/* ----------------------------- product detail ---------------------------- */

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
  /** Root-to-leaf trail, which is what the breadcrumb walks. */
  path?: { id: string; name: string; slug: string }[];
}

export interface BrandDetail extends BrandRef {
  logo?: string | null;
}

export interface StockInfo {
  quantity: number;
  trackInventory: boolean;
  allowBackorder: boolean;
  /** At or under this, the UI says how few are left. */
  lowStockThreshold: number;
  status: "IN_STOCK" | "OUT_OF_STOCK" | (string & {});
}

/**
 * One titled block of the spec table. `options` values may be a scalar or a
 * list - `compatibility: ["android", "usb-c"]` alongside `battery_life: 24`.
 */
export interface AttributeGroup {
  title: string;
  options: Record<string, string | number | boolean | (string | number)[]>;
}

/** One buyable SKU of a VARIABLE product. */
export interface Variation {
  id: string;
  productId: string;
  sku: string;
  /** Keyed by `variantOptionKeys`, e.g. `{ color: "black" }`. */
  options: Record<string, string>;
  sellingPrice: number;
  originalPrice?: number;
  stock: StockInfo;
  status: string;
  image?: Media | null;
  sortOrder: number;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  categoryIds: CategoryRef[];
  brandId?: BrandDetail | null;
  productType: ProductType;
  sku: string;
  status: string;
  featured: boolean;
  tags: string[];
  attributes: AttributeGroup[];
  /** Which option axes a VARIABLE product varies on, in display order. */
  variantOptionKeys: string[];
  currency: string;
  sellingPrice: number;
  originalPrice?: number;
  stock: StockInfo;
  shipping?: {
    requiresShipping: boolean;
    freeShipping: boolean;
    weight?: { value: number; unit: string };
    dimensions?: {
      length: number;
      width: number;
      height: number;
      unit: string;
    };
  };
  thumbnail?: Media | null;
  images: Media[];
  seo?: { title?: string; description?: string; keywords?: string[] };
  /** Empty for a SIMPLE product. */
  variations: Variation[];
}

export type ShopSortField = "relevance" | "price" | "name" | "createdAt";

export interface ShopQuery {
  categorySlugs?: string[];
  brandSlugs?: string[];
  search?: string;
  price?: { min?: number; max?: number };
  inStock?: boolean;
  featured?: boolean;
  /** Category-driven keys from `GET /shop/filter-options/{slug}`. Never hardcode. */
  filters?: Record<string, string[] | { min: number; max: number }>;
  sort?: { field?: ShopSortField; direction?: "asc" | "desc" };
  pagination?: { page?: number; limit?: number };
}

export interface CategoryQuery {
  showInHome?: boolean;
  forceCategories?: boolean;
  search?: string;
  pagination?: { page?: number; limit?: number };
}

/** What a section gets back. `meta` is null when the call failed. */
export interface Paged<T> {
  items: T[];
  meta: PaginationMeta | null;
}

const EMPTY: Paged<never> = { items: [], meta: null };

/* -------------------------------- fetching ------------------------------- */

/**
 * One catalog call.
 *
 * Resolves to `null` rather than throwing. A home page is a shop window made
 * of independent panes: if the featured rail cannot load, the categories and
 * the FAQ below it should still render. The caller substitutes an empty state
 * for the pane that failed - see `Paged.meta === null`.
 */
async function shopFetch<T>(
  path: string,
  body: unknown,
): Promise<ApiEnvelope<T> | null> {
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Prices and stock decide whether a shopper can buy; a stale grid sends
      // them to a product page that disagrees with it.
      cache: "no-store",
    });

    const payload = (await response
      .json()
      .catch(() => null)) as ApiEnvelope<T> | null;

    if (!response.ok || !payload?.success) {
      console.error(
        `[shop] ${path} -> ${payload?.statusCode ?? response.status} ${
          payload?.message ?? response.statusText
        }`,
      );
      return null;
    }

    return payload;
  } catch (error) {
    // Next signals control flow - `notFound()`, redirects, and the bail-out
    // that marks a route dynamic - by throwing. Swallowing those here would
    // leave the framework thinking this render succeeded, so they go straight
    // back up; only real network failures fall through to the empty state.
    unstable_rethrow(error);

    console.error(`[shop] ${path} unreachable`, error);
    return null;
  }
}

/**
 * One product, by slug.
 *
 * A GET, unlike the rest of this module - and the only call here that
 * distinguishes "missing" from "broken". `null` means the slug is not a
 * product, which the page turns into a 404; a network failure still throws
 * through `shopFetch`'s own logging path and renders the error boundary,
 * because a product page with no product is not a page.
 */
export async function getProduct(slug: string): Promise<ProductDetail | null> {
  try {
    const response = await fetch(
      `${BASE}/shop/${encodeURIComponent(slug)}`,
      {
        // Price and stock decide whether this page can be acted on.
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    );

    if (response.status === 404) return null;

    const payload = (await response
      .json()
      .catch(() => null)) as ApiEnvelope<{ product: ProductDetail }> | null;

    if (!response.ok || !payload?.success) {
      console.error(
        `[shop] /shop/${slug} -> ${payload?.statusCode ?? response.status} ${
          payload?.message ?? response.statusText
        }`,
      );
      return null;
    }

    return payload.data?.product ?? null;
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[shop] /shop/${slug} unreachable`, error);
    return null;
  }
}

/** Browse the catalog. Every field is optional; the API defaults the rest. */
export async function getProducts(query: ShopQuery): Promise<Paged<ProductCard>> {
  const payload = await shopFetch<{ products: ProductCard[] }>("/shop", query);
  if (!payload) return EMPTY;

  return { items: payload.data?.products ?? [], meta: payload.meta ?? null };
}

/** Category tiles. `showInHome` is curation; empty categories are hidden. */
export async function getCategories(
  query: CategoryQuery,
): Promise<Paged<ShopCategory>> {
  const payload = await shopFetch<{ categories: ShopCategory[] }>(
    "/shop/categories",
    query,
  );
  if (!payload) return EMPTY;

  return { items: payload.data?.categories ?? [], meta: payload.meta ?? null };
}

/* ----------------------------- home page reads --------------------------- */
/* The bodies the home page sends, named once so a section component reads as
 * intent ("featured products") rather than as a filter literal. */

export function getFeaturedProducts(limit = 24) {
  return getProducts({
    inStock: true,
    featured: true,
    sort: { field: "price", direction: "asc" },
    pagination: { page: 0, limit },
  });
}

export function getHomeCategories(limit = 12) {
  return getCategories({
    showInHome: true,
    pagination: { page: 0, limit },
  });
}

/**
 * Other products from the same category.
 *
 * Asks for more than it needs on two counts: the product being viewed sits in
 * its own category and would otherwise take a slot in its own "related" row,
 * and `skip` lets a second placement on the same page continue where the first
 * left off instead of repeating it. The listing order is stable for identical
 * filters, so paging by slice is sound here.
 */
export async function getRelatedProducts(
  categorySlug: string | undefined,
  excludeId: string,
  limit = 10,
  skip = 0,
) {
  if (!categorySlug) return { items: [], meta: null } as Paged<ProductCard>;

  const { items, meta } = await getProducts({
    categorySlugs: [categorySlug],
    inStock: true,
    pagination: { page: 0, limit: limit + skip + 1 },
  });

  return {
    items: items
      .filter((product) => product.id !== excludeId)
      .slice(skip, skip + limit),
    meta,
  };
}

export function getLatestProducts(limit = 20) {
  return getProducts({
    inStock: true,
    featured: false,
    pagination: { page: 0, limit },
  });
}

/* ------------------------------ shop filters ----------------------------- */

/** How a filter group should be drawn. The category's config decides. */
export type FilterType = "checkbox" | "select" | "range" | "color";

export interface FilterOption {
  value: string;
  label: string;
  /** Products in this category carrying the value. Not narrowed by other filters. */
  count: number;
}

export interface FilterGroup {
  id: string;
  /** The attribute key to send back under `filters`. */
  key: string;
  label: string;
  type: FilterType;
  options: FilterOption[];
  /** Present on `range`: the span the data actually covers. */
  range?: { min: number; max: number };
  /** Present on `range`: the widest the attribute is allowed to go. */
  limits?: { min: number; max: number };
}

/**
 * The sidebar for one category.
 *
 * A GET, and the only catalog read here that is: the options for a category
 * are the same for every shopper and change only when the catalog does, so
 * this is cacheable by the browser and by anything in front of it. Attribute
 * filters are category-scoped by design, which is why there is no
 * all-categories variant - without a category there is nothing to resolve the
 * keys against.
 */
export async function getFilterOptions(
  categorySlug: string,
): Promise<FilterGroup[]> {
  try {
    const response = await fetch(
      `${BASE}/shop/filter-options/${encodeURIComponent(categorySlug)}`,
      { cache: "no-store" },
    );

    const payload = (await response
      .json()
      .catch(() => null)) as ApiEnvelope<FilterGroup[]> | null;

    if (!response.ok || !payload?.success) {
      console.error(
        `[shop] filter-options/${categorySlug} -> ${
          payload?.statusCode ?? response.status
        }`,
      );
      return [];
    }

    return payload.data ?? [];
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[shop] filter-options/${categorySlug} unreachable`, error);
    return [];
  }
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo?: Media | null;
}

/**
 * Every brand, for the sidebar.
 *
 * Not scoped to the current category: the endpoint has no such filter, so a
 * brand with nothing in the selected category still appears. That is a real
 * limitation rather than an oversight - see the note in `filter-sidebar`.
 */
export async function getBrands(limit = 100): Promise<Brand[]> {
  const payload = await shopFetch<{ brands: Brand[] }>("/brands/filter", {
    pagination: { page: 0, limit },
  });

  return payload?.data?.brands ?? [];
}
