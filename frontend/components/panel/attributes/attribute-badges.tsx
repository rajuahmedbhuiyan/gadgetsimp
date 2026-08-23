"use client";

import { cn } from "@/lib/utils";
import type {
  AttributeSource,
  AttributeType,
  CatalogStatus,
} from "@/lib/api/admin/attributes";
import { Badge } from "@/components/ui/badge";

export const ATTRIBUTE_SOURCE_LABEL: Record<AttributeSource, string> = {
  product: "Product",
  variant: "Variant",
  entity: "Entity",
};

export const ATTRIBUTE_TYPE_LABEL: Record<AttributeType, string> = {
  checkbox: "Checkbox",
  radio: "Radio",
  select: "Select",
  color: "Color",
  range: "Range",
};

export const CATALOG_STATUS_LABEL: Record<CatalogStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ARCHIVED: "Archived",
};

export function AttributeSourceBadge({ source }: { source: AttributeSource }) {
  return (
    <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
      {ATTRIBUTE_SOURCE_LABEL[source]}
    </Badge>
  );
}

export function AttributeTypeBadge({ type }: { type: AttributeType }) {
  return (
    <Badge
      className={cn(
        "rounded-full px-2.5 py-1 text-xs",
        type === "range" && "bg-primary text-primary-foreground",
        type === "color" && "bg-brand text-brand-foreground",
        type !== "range" && type !== "color" && "bg-muted text-muted-foreground",
      )}
    >
      {ATTRIBUTE_TYPE_LABEL[type]}
    </Badge>
  );
}

export function CatalogStatusBadge({ status }: { status?: CatalogStatus }) {
  if (!status) return null;

  return (
    <Badge
      className={cn(
        "rounded-full px-2.5 py-1 text-xs",
        status === "ACTIVE" && "bg-success text-success-foreground",
        status === "DRAFT" && "bg-muted text-muted-foreground",
        status === "INACTIVE" && "bg-warning text-warning-foreground",
        status === "ARCHIVED" && "bg-destructive text-white",
      )}
    >
      {CATALOG_STATUS_LABEL[status]}
    </Badge>
  );
}
