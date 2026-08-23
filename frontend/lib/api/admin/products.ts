/**
 * The catalogue, from the staff side.
 *
 * Every route under `/products` is gated at `ROLE_MODERATOR` on the API, so
 * this module makes no distinction of its own - see `lib/panel/permissions`,
 * which mirrors that gate rather than inventing a second one.
 *
 * Two things about this surface are worth knowing before using it:
 *
 * **The list is the admin catalogue.** `POST /products/filter` can include
 * drafts, hidden products and lifecycle filters. The storefront reads through
 * `/shop`, which keeps its own public-only gate.
 *
 * **Saving is per-panel, not whole-document.** `PUT /products/:id` replaces
 * the record, so a form that did not load every field would silently reset the
 * ones it missed. The `patch*` calls each own one panel, which is why the edit
 * screen is built from them and `update()` is left for the rare full replace.
 */

import { api } from "@/lib/api/client";
import type { PaginationMeta } from "@/lib/api/types";

/* --------------------------------- enums --------------------------------- */

export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "OUT_OF_STOCK"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_VISIBILITIES = ["PUBLIC", "HIDDEN"] as const;
export type ProductVisibility = (typeof PRODUCT_VISIBILITIES)[number];

export const PRODUCT_TYPES = ["SIMPLE", "VARIABLE"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const STOCK_STATUSES = ["IN_STOCK", "OUT_OF_STOCK", "BACKORDER"] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

/* --------------------------------- shapes -------------------------------- */

export interface AdminImage {
  src: string;
  alt: string;
  id?: number;
}

export interface TaxonomyRef {
  id: string;
  name: string;
  slug: string;
}

export interface ProductStock {
  trackInventory?: boolean;
  quantity?: number;
  lowStockThreshold?: number;
  allowBackorder?: boolean;
  status?: StockStatus;
}

/** One titled block of the spec table. Order is display order. */
export interface AttributeGroup {
  title: string;
  options: Record<string, string | number | boolean | (string | number | boolean)[]>;
}

export interface ProductSeo {
  title?: string;
  description?: string;
  keywords?: string[];
  canonicalUrl?: string;
  noIndex?: boolean;
  noFollow?: boolean;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
}

/** A row in the admin table. */
export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  sku?: string;
  shortDescription?: string;
  categoryIds: TaxonomyRef[];
  brandId?: TaxonomyRef | null;
  productType: ProductType;
  status: ProductStatus;
  visibility: ProductVisibility;
  featured: boolean;
  tags: string[];
  thumbnail?: AdminImage | null;
  images: AdminImage[];
  currency: string;
  sellingPrice?: number;
  originalPrice?: number;
  stock?: ProductStock;
  pricing: { min: number; max: number; currency: string };
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /products/:id`, which unlike the list does carry the lifecycle fields. */
export interface AdminProduct extends AdminProductRow {
  description: string;
  status: ProductStatus;
  visibility: ProductVisibility;
  attributes: AttributeGroup[];
  seo?: ProductSeo;
  shipping?: {
    requiresShipping?: boolean;
    freeShipping?: boolean;
    weight?: { value: number; unit: string };
    dimensions?: { length: number; width: number; height: number; unit: string };
  };
  sku?: string;
  variationOptions?: Record<string, string[]>;
}

/** What the admin listing accepts. The API body is still `.strict()`. */
export interface AdminProductQuery {
  categoryId?: string;
  brandId?: string;
  status?: ProductStatus;
  visibility?: ProductVisibility;
  productType?: ProductType;
  featured?: boolean;
  stockStatus?: StockStatus;
  search?: string;
  filters?: Record<string, string[] | { min?: number; max?: number }>;
  price?: { min?: number; max?: number };
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  sort?: {
    field?: "relevance" | "price" | "name" | "createdAt" | "updatedAt";
    direction?: "asc" | "desc";
  };
  pagination?: { page?: number; limit?: number };
}

export interface AdminProductPage {
  products: AdminProductRow[];
  meta: PaginationMeta | null;
}

/* -------------------------------- payloads -------------------------------- */

export interface ProductWritePayload {
  name: string;
  slug: string;
  description: string;
  shortDescription?: string;
  categoryIds: string[];
  brandId?: string;
  sku?: string;
  status?: ProductStatus;
  visibility?: ProductVisibility;
  featured?: boolean;
  tags?: string[];
  attributes?: AttributeGroup[];
  currency?: "BDT";
  sellingPrice: number;
  originalPrice?: number;
  stock?: ProductStock;
  thumbnail: AdminImage;
  images?: AdminImage[];
  seo?: ProductSeo;
  productType?: ProductType;
}

/* ---------------------------------- api ---------------------------------- */

export const adminProductsApi = {
  async list(query: AdminProductQuery): Promise<AdminProductPage> {
    const payload = await api<{ products: AdminProductRow[] }>(
      "/products/filter",
      { method: "POST", body: query },
    );

    return { products: payload.data.products, meta: payload.meta ?? null };
  },

  async get(id: string): Promise<AdminProduct> {
    const payload = await api<{ product: AdminProduct }>(`/products/${id}`);
    return payload.data.product;
  },

  async create(body: ProductWritePayload): Promise<AdminProduct> {
    const payload = await api<{ product: AdminProduct }>("/products", {
      method: "POST",
      body,
    });
    return payload.data.product;
  },

  /** Whole-document replace. Prefer a `patch*` unless every field is loaded. */
  async update(id: string, body: ProductWritePayload): Promise<AdminProduct> {
    const payload = await api<{ product: AdminProduct }>(`/products/${id}`, {
      method: "PUT",
      body,
    });
    return payload.data.product;
  },

  /** Archives rather than destroys - the API calls the result "Product archived". */
  remove(id: string) {
    return api<{ deleted: unknown }>(`/products/${id}`, { method: "DELETE" });
  },

  /* One call per panel of the edit screen, so a save never touches a field
     the form did not show. */
  patch: {
    general(id: string, body: Partial<Pick<ProductWritePayload, "name" | "slug" | "sku" | "status" | "visibility" | "featured" | "categoryIds">> & { brandId?: string | null }) {
      return patch(id, "general", body);
    },
    description(id: string, body: { description?: string; shortDescription?: string | null }) {
      return patch(id, "description", body);
    },
    pricing(id: string, body: { sellingPrice?: number; originalPrice?: number | null; currency?: "BDT" }) {
      return patch(id, "pricing", body);
    },
    stock(id: string, body: { stock: ProductStock }) {
      return patch(id, "stock", body);
    },
    attributes(id: string, body: { attributes?: AttributeGroup[]; tags?: string[] }) {
      return patch(id, "attributes", body);
    },
    media(id: string, body: { thumbnail?: AdminImage; images?: AdminImage[] }) {
      return patch(id, "media", body);
    },
    seo(id: string, body: { seo: ProductSeo }) {
      return patch(id, "seo", body);
    },
    /** List-view quick actions: exactly one decision each. */
    featured(id: string, featured: boolean) {
      return patch(id, "featured", { featured });
    },
    status(id: string, body: { status?: ProductStatus; visibility?: ProductVisibility }) {
      return patch(id, "status", body);
    },
  },
};

async function patch(id: string, section: string, body: unknown) {
  const payload = await api<{ product: AdminProduct }>(
    `/products/${id}/${section}`,
    { method: "PATCH", body },
  );
  return payload.data.product;
}

/* ------------------------------- taxonomy -------------------------------- */

/**
 * Categories and brands for the form's selects.
 *
 * Both listings are public on the API - no auth on `POST /categories/filter`
 * or `POST /brands/filter` - but they are read here through the authenticated
 * client anyway, because the panel is behind a session regardless and one
 * client means one place that handles a 401.
 */
/** A category and its subtree, as `POST /categories/filter-groupped` returns it. */
export interface CategoryNode extends TaxonomyRef {
  parentId: string | null;
  children: CategoryNode[];
}

/** A selectable category: a leaf, plus the ancestors that lead to it. */
export interface CategoryLeaf {
  id: string;
  name: string;
  /** Root-to-leaf, excluding the leaf itself. */
  ancestors: TaxonomyRef[];
  /** `Electronics › Audio › Earbuds`, for showing the choice in one line. */
  path: string;
}

/**
 * Flatten a tree into the leaves a product may actually be filed under.
 *
 * Only leaves, because a parent category is a grouping rather than a shelf -
 * filing a product under "Electronics" says less than "Earbuds" does, and the
 * parents come along automatically via `ancestors`.
 */
export function leavesOf(nodes: CategoryNode[]): CategoryLeaf[] {
  const leaves: CategoryLeaf[] = [];

  const walk = (node: CategoryNode, trail: TaxonomyRef[]) => {
    if (node.children.length === 0) {
      leaves.push({
        id: node.id,
        name: node.name,
        ancestors: trail,
        path: [...trail.map((entry) => entry.name), node.name].join(" › "),
      });
      return;
    }

    const next = [...trail, { id: node.id, name: node.name, slug: node.slug }];
    for (const child of node.children) walk(child, next);
  };

  for (const node of nodes) walk(node, []);
  return leaves;
}

/**
 * One generated combination.
 *
 * The endpoint echoes every default it was given back on each row - price,
 * stock, status, image - so the response is the seed for the editable grid
 * rather than just a list of option pairs.
 */
export interface GeneratedVariation {
  options: Record<string, string>;
  sortOrder: number;
  /**
   * Not sent today - the generate body is `.strict()` with no `sku` field, so
   * the server has nothing to echo. Read anyway, so the client uses the
   * server's answer the day that changes rather than its own guess.
   */
  sku?: string;
  sellingPrice?: number;
  originalPrice?: number;
  stock?: ProductStock;
  status?: ProductStatus;
  image?: AdminImage;
}

/**
 * Ask the API to expand option axes into combinations.
 *
 * `POST /variations/generate` persists nothing - it is a pure cartesian
 * product plus the API's own guard rails (1-500 combinations, unique values
 * per axis) and the defaults applied to every row.
 *
 * It is gated at `ROLE_ADMIN` while the product routes are `ROLE_MODERATOR`,
 * so a moderator building a variable product would meet a 403 here. The caller
 * falls back to generating locally rather than blocking them - the maths is
 * the same, only the server-side limit check is lost.
 */
export async function generateVariations(body: {
  options: Record<string, string[]>;
  sellingPrice?: number;
  originalPrice?: number;
  stock?: ProductStock;
  status?: ProductStatus;
  image?: AdminImage;
}): Promise<GeneratedVariation[]> {
  const payload = await api<{ variations: GeneratedVariation[] }>(
    "/variations/generate",
    { method: "POST", body },
  );

  return payload.data.variations;
}

export const adminTaxonomyApi = {
  /**
   * The category tree.
   *
   * The grouped endpoint rather than the flat one: the form needs to know
   * which categories are leaves and what sits above them, and rebuilding that
   * from a flat list of `parentId`s client-side is work the API already did.
   */
  async categoryTree(): Promise<CategoryNode[]> {
    const payload = await api<{ categories: CategoryNode[] }>(
      "/categories/filter-groupped",
      { method: "POST", body: {} },
    );
    return payload.data.categories;
  },

  async brands(limit = 100): Promise<TaxonomyRef[]> {
    const payload = await api<{ brands: TaxonomyRef[] }>("/brands/filter", {
      method: "POST",
      body: { pagination: { page: 0, limit } },
    });
    return payload.data.brands;
  },
};
