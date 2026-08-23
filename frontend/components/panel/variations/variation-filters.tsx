"use client";

import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  PRODUCT_STATUSES,
  type ProductStatus,
} from "@/lib/api/admin/variations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRODUCT_STATUS_LABEL } from "./variation-badges";

const CONTROL = "h-10 rounded-lg text-sm";
const ALL = "__all";

export interface VariationFilterState {
  search: string;
  productId: string;
  status: ProductStatus | "";
}

export function VariationFilters({
  value,
  onChange,
  onClear,
}: {
  value: VariationFilterState;
  onChange: (patch: Partial<VariationFilterState>) => void;
  onClear: () => void;
}) {
  const touched = Boolean(value.search || value.productId || value.status);

  return (
    <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-end">
      <div className="flex min-w-0 items-center gap-2 xl:flex-1">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={value.search}
            placeholder="Search SKU or barcode..."
            aria-label="Search variations by SKU or barcode"
            onChange={(event) => onChange({ search: event.target.value })}
            className={cn(CONTROL, "pl-9", value.search && "pr-9", "[&::-webkit-search-cancel-button]:appearance-none")}
          />
          {value.search ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChange({ search: "" })}
              className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>

        {touched ? (
          <Button variant="outline" onClick={onClear} aria-label="Clear all filters" className={cn(CONTROL, "shrink-0 cursor-pointer gap-2 px-3")}>
            <X className="size-4" aria-hidden />
            <span className="max-sm:sr-only">Clear all</span>
          </Button>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-2 xl:flex xl:shrink-0">
        {/* <label className="grid min-w-0 gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Product ID</span>
          <Input
            value={value.productId}
            placeholder="e.g. 66bca1f8d7432e0012345683"
            aria-label="Filter by product id"
            onChange={(event) => onChange({ productId: event.target.value.trim() })}
            className={cn(CONTROL, "min-w-0 font-mono text-xs xl:w-72")}
          />
        </label> */}

        <label className="grid min-w-0 gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          <Select
            value={value.status || ALL}
            onValueChange={(next) =>
              onChange({ status: next === ALL ? "" : (next as ProductStatus) })
            }
          >
            <SelectTrigger aria-label="Status" className={cn(CONTROL, "data-[size=default]:h-10 w-full min-w-0 cursor-pointer xl:w-40")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {PRODUCT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {PRODUCT_STATUS_LABEL[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
    </div>
  );
}
