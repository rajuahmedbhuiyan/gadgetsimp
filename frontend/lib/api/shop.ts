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

export function getLatestProducts(limit = 20) {
  return getProducts({
    inStock: true,
    featured: false,
    pagination: { page: 0, limit },
  });
}
