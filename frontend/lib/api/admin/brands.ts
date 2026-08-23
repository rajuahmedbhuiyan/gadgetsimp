import { api } from "@/lib/api/client";
import type { PaginationMeta } from "@/lib/api/types";

export const CATALOG_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export const CATALOG_VISIBILITIES = ["PUBLIC", "PRIVATE", "HIDDEN"] as const;
export type CatalogVisibility = (typeof CATALOG_VISIBILITIES)[number];

export interface BrandSeo {
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

export interface AdminBrand {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  website?: string;
  status?: CatalogStatus;
  visibility?: CatalogVisibility;
  seo?: BrandSeo;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface BrandWritePayload {
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  website?: string;
  status?: CatalogStatus;
  visibility?: CatalogVisibility;
  seo?: BrandSeo;
  publishedAt?: string | null;
}

export interface AdminBrandQuery {
  search?: string;
  pagination?: { page?: number; limit?: number };
}

export interface AdminBrandPage {
  brands: AdminBrand[];
  meta: PaginationMeta | null;
}

export const adminBrandsApi = {
  async list(query: AdminBrandQuery): Promise<AdminBrandPage> {
    const payload = await api<{ brands: AdminBrand[] }>("/brands/filter", {
      method: "POST",
      body: query,
    });

    return { brands: payload.data.brands, meta: payload.meta ?? null };
  },

  async create(body: BrandWritePayload): Promise<AdminBrand> {
    const payload = await api<{ brand: AdminBrand }>("/brands", {
      method: "POST",
      body,
    });
    return payload.data.brand;
  },

  async update(id: string, body: BrandWritePayload): Promise<AdminBrand> {
    const payload = await api<{ brand: AdminBrand }>(`/brands/${id}`, {
      method: "PUT",
      body,
    });
    return payload.data.brand;
  },

  async remove(id: string): Promise<{ id: string }> {
    const payload = await api<{ deleted: { id: string } }>(`/brands/${id}`, {
      method: "DELETE",
    });
    return payload.data.deleted;
  },
};
