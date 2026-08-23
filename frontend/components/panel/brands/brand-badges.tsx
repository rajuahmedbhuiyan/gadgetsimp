"use client";

import { cn } from "@/lib/utils";
import type { CatalogStatus, CatalogVisibility } from "@/lib/api/admin/brands";
import { Badge } from "@/components/ui/badge";

export const CATALOG_STATUS_LABEL: Record<CatalogStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ARCHIVED: "Archived",
};

export const VISIBILITY_LABEL: Record<CatalogVisibility, string> = {
  PUBLIC: "Public",
  PRIVATE: "Private",
  HIDDEN: "Hidden",
};

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

export function VisibilityBadge({
  visibility,
}: {
  visibility?: CatalogVisibility;
}) {
  if (!visibility) return null;

  return (
    <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
      {VISIBILITY_LABEL[visibility]}
    </Badge>
  );
}
