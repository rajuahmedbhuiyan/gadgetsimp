import { api } from "@/lib/api/client";
import type { PaginationMeta } from "@/lib/api/types";
import { CATALOG_STATUSES, type CatalogStatus } from "./brands";

export { CATALOG_STATUSES, type CatalogStatus };

export const ATTRIBUTE_SOURCES = ["product", "variant", "entity"] as const;
export type AttributeSource = (typeof ATTRIBUTE_SOURCES)[number];

export const ATTRIBUTE_TYPES = [
  "checkbox",
  "radio",
  "select",
  "color",
  "range",
] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export interface AttributeDisplay {
  helpText?: string;
  placeholder?: string;
  showInProductDetails?: boolean;
}

export interface AdminAttribute {
  id: string;
  name: string;
  key: string;
  slug: string;
  description?: string;
  source: AttributeSource;
  type: AttributeType;
  status?: CatalogStatus;
  min?: number;
  max?: number;
  display?: AttributeDisplay;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface AttributeWritePayload {
  name: string;
  key: string;
  slug: string;
  description?: string;
  source: AttributeSource;
  type: AttributeType;
  status?: CatalogStatus;
  min?: number;
  max?: number;
  display?: AttributeDisplay;
}

export interface AdminAttributeQuery {
  search?: string;
  source?: AttributeSource;
  type?: AttributeType;
  status?: CatalogStatus;
  page?: number;
  limit?: number;
}

export interface AdminAttributePage {
  attributes: AdminAttribute[];
  meta: PaginationMeta | null;
}

export const adminAttributesApi = {
  async list(query: AdminAttributeQuery): Promise<AdminAttributePage> {
    const payload = await api<{ attributes: AdminAttribute[] }>("/attributes/filter", {
      method: "POST",
      body: query,
    });

    return { attributes: payload.data.attributes, meta: payload.meta ?? null };
  },

  async create(body: AttributeWritePayload): Promise<AdminAttribute> {
    const payload = await api<{ attribute: AdminAttribute }>("/attributes", {
      method: "POST",
      body,
    });
    return payload.data.attribute;
  },

  async update(id: string, body: AttributeWritePayload): Promise<AdminAttribute> {
    const payload = await api<{ attribute: AdminAttribute }>(`/attributes/${id}`, {
      method: "PUT",
      body,
    });
    return payload.data.attribute;
  },

  async remove(id: string): Promise<{ id: string }> {
    const payload = await api<{ deleted: { id: string } }>(`/attributes/${id}`, {
      method: "DELETE",
    });
    return payload.data.deleted;
  },
};
