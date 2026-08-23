import { api } from "@/lib/api/client";
import type { PaginationMeta } from "@/lib/api/types";
import {
  CATALOG_STATUSES,
  CATALOG_VISIBILITIES,
  type CatalogStatus,
  type CatalogVisibility,
} from "./brands";
import type { AttributeSource, AttributeType } from "./attributes";

export { CATALOG_STATUSES, CATALOG_VISIBILITIES };
export type { CatalogStatus, CatalogVisibility };

export interface CategorySeo {
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

export interface CategoryParent {
  id: string;
  name: string;
  slug: string;
}

export interface CategoryAttribute {
  id: string;
  name: string;
  key: string;
  source: AttributeSource;
  type: AttributeType;
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId: CategoryParent | null;
  status?: CatalogStatus;
  visibility?: CatalogVisibility;
  image?: string;
  attributes?: CategoryAttribute[];
  seo?: CategorySeo;
  sortOrder?: number;
  showInHome?: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CategoryNode extends AdminCategory {
  children: CategoryNode[];
}

export interface CategoryWritePayload {
  name: string;
  slug: string;
  description?: string;
  parentId?: string | null;
  status?: CatalogStatus;
  visibility?: CatalogVisibility;
  image?: string;
  attributes?: string[];
  seo?: CategorySeo;
  sortOrder?: number;
  showInHome?: boolean;
}

export interface CategorySortEntry {
  id: string;
  parentId?: string | null;
  sortOrder: number;
}

export interface AdminCategoryQuery {
  parentId?: string | null;
  search?: string;
  pagination?: { page?: number; limit?: number };
}

export interface AdminCategoryPage {
  categories: AdminCategory[];
  meta: PaginationMeta | null;
}

export const adminCategoriesApi = {
  async list(query: AdminCategoryQuery): Promise<AdminCategoryPage> {
    const payload = await api<{ categories: AdminCategory[] }>("/categories/filter", {
      method: "POST",
      body: query,
    });

    return { categories: payload.data.categories, meta: payload.meta ?? null };
  },

  async tree(query: { parentId?: string | null; search?: string } = {}): Promise<CategoryNode[]> {
    const payload = await api<{ categories: CategoryNode[] }>(
      "/categories/filter-groupped",
      { method: "POST", body: query },
    );
    return payload.data.categories;
  },

  async create(body: CategoryWritePayload): Promise<AdminCategory> {
    const payload = await api<{ category: AdminCategory }>("/categories", {
      method: "POST",
      body,
    });
    return payload.data.category;
  },

  async update(id: string, body: CategoryWritePayload): Promise<AdminCategory> {
    const payload = await api<{ category: AdminCategory }>(`/categories/${id}`, {
      method: "PUT",
      body,
    });
    return payload.data.category;
  },

  async sort(categories: CategorySortEntry[]): Promise<Pick<AdminCategory, "id" | "parentId" | "sortOrder">[]> {
    const payload = await api<{ categories: Pick<AdminCategory, "id" | "parentId" | "sortOrder">[] }>(
      "/categories/sort",
      { method: "PUT", body: { categories } },
    );
    return payload.data.categories;
  },

  async setShowInHome(ids: string[], showInHome: boolean): Promise<AdminCategory[]> {
    const payload = await api<{ categories: AdminCategory[] }>(
      "/categories/show-in-home",
      { method: "PATCH", body: { ids, showInHome } },
    );
    return payload.data.categories;
  },

  async remove(id: string): Promise<{ id: string }> {
    const payload = await api<{ deleted: { id: string } }>(`/categories/${id}`, {
      method: "DELETE",
    });
    return payload.data.deleted;
  },
};
