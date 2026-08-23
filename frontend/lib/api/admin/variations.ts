import { api } from "@/lib/api/client";
import type { PaginationMeta } from "@/lib/api/types";
import {
  PRODUCT_STATUSES,
  STOCK_STATUSES,
  type AdminImage,
  type ProductStatus,
  type ProductStock,
  type StockStatus,
  type TaxonomyRef,
} from "./products";

export { PRODUCT_STATUSES, STOCK_STATUSES };
export type { AdminImage, ProductStatus, ProductStock, StockStatus };

export interface VariationProduct extends TaxonomyRef {
  currency: string;
}

export interface AdminVariation {
  id: string;
  productId: VariationProduct;
  sku: string;
  barcode?: string;
  options: Record<string, string>;
  sellingPrice: number;
  originalPrice?: number;
  stock?: ProductStock;
  status?: ProductStatus;
  image?: AdminImage;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface VariationPatchPayload {
  sku?: string;
  barcode?: string;
  sellingPrice?: number;
  originalPrice?: number;
  stock?: Partial<ProductStock>;
  status?: ProductStatus;
  image?: AdminImage;
  sortOrder?: number;
}

export interface AdminVariationQuery {
  productId?: string;
  search?: string;
  status?: ProductStatus;
  pagination?: { page?: number; limit?: number };
}

export interface AdminVariationPage {
  variations: AdminVariation[];
  meta: PaginationMeta | null;
}

export const adminVariationsApi = {
  async list(query: AdminVariationQuery): Promise<AdminVariationPage> {
    const payload = await api<{ variations: AdminVariation[] }>("/variations/filter", {
      method: "POST",
      body: query,
    });

    return { variations: payload.data.variations, meta: payload.meta ?? null };
  },

  async update(id: string, body: VariationPatchPayload): Promise<AdminVariation> {
    const payload = await api<{ variation: AdminVariation }>(`/variations/${id}`, {
      method: "PATCH",
      body,
    });
    return payload.data.variation;
  },

  async remove(id: string): Promise<{ id: string }> {
    const payload = await api<{ deleted: { id: string } }>(`/variations/${id}`, {
      method: "DELETE",
    });
    return payload.data.deleted;
  },
};
