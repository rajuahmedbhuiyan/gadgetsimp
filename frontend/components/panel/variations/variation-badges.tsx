"use client";

import { cn } from "@/lib/utils";
import type { ProductStatus, StockStatus } from "@/lib/api/admin/variations";
import { Badge } from "@/components/ui/badge";

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  OUT_OF_STOCK: "Out of stock",
};

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  IN_STOCK: "In stock",
  OUT_OF_STOCK: "Out of stock",
  BACKORDER: "Backorder",
};

export function ProductStatusBadge({ status }: { status?: ProductStatus }) {
  if (!status) return null;

  return (
    <Badge
      className={cn(
        "rounded-full px-2.5 py-1 text-xs",
        status === "ACTIVE" && "bg-success text-success-foreground",
        status === "DRAFT" && "bg-muted text-muted-foreground",
        status === "OUT_OF_STOCK" && "bg-warning text-warning-foreground",
      )}
    >
      {PRODUCT_STATUS_LABEL[status]}
    </Badge>
  );
}

export function StockStatusBadge({ status }: { status?: StockStatus }) {
  if (!status) return null;

  return (
    <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
      {STOCK_STATUS_LABEL[status]}
    </Badge>
  );
}
