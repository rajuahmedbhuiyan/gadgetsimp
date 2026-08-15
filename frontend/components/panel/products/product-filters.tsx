"use client";

/**
 * The controls above the product table.
 *
 * Deliberately three, not six. `POST /products/filter` is `.strict()` and
 * accepts `categoryId`, `search`, `filters`, `sort` and `pagination` - a
 * status or brand key would be a 422, not an ignored field - so those filters
 * are absent rather than present and broken. `filters` (per-category attribute
 * filters) needs a category first and belongs to a screen that has one.
 */

import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TaxonomyRef } from "@/lib/api/admin/products";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const PRODUCT_SORTS = [
  { value: "newest", label: "Newest first", field: "createdAt", direction: "desc" },
  { value: "oldest", label: "Oldest first", field: "createdAt", direction: "asc" },
  { value: "name-asc", label: "Name A–Z", field: "name", direction: "asc" },
  { value: "name-desc", label: "Name Z–A", field: "name", direction: "desc" },
  { value: "price-asc", label: "Price low to high", field: "price", direction: "asc" },
  { value: "price-desc", label: "Price high to low", field: "price", direction: "desc" },
] as const;

const CONTROL = "h-10 rounded-lg text-sm";
const ALL = "__all__";

export function ProductFilters({
  search,
  onSearchChange,
  categoryId,
  onCategoryChange,
  sort,
  onSortChange,
  categories,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  categoryId: string;
  onCategoryChange: (value: string) => void;
  sort: string;
  onSortChange: (value: string) => void;
  categories: TaxonomyRef[];
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={search}
          placeholder="Search products…"
          aria-label="Search products by name"
          onChange={(event) => onSearchChange(event.target.value)}
          className={cn(
            CONTROL,
            "pl-9",
            search && "pr-9",
            "[&::-webkit-search-cancel-button]:appearance-none",
          )}
        />
        {search ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearchChange("")}
            className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={categoryId || ALL}
          onValueChange={(value) =>
            onCategoryChange(String(value) === ALL ? "" : String(value))
          }
        >
          <SelectTrigger
            aria-label="Filter by category"
            className={cn(CONTROL, "data-[size=default]:h-10 w-full min-w-0 flex-1 cursor-pointer sm:w-44 sm:flex-none")}
          >
            {/* Without children Base UI prints the stored value, so the
                trigger read "__all__" rather than "All categories". */}
            <SelectValue>
              {(value) =>
                categories.find((category) => category.id === value)?.name ??
                "All categories"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="cursor-pointer text-sm">
              All categories
            </SelectItem>
            {categories.map((category) => (
              <SelectItem
                key={category.id}
                value={category.id}
                className="cursor-pointer text-sm"
              >
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(value) => onSortChange(String(value))}>
          <SelectTrigger
            aria-label="Sort products"
            className={cn(CONTROL, "data-[size=default]:h-10 w-full min-w-0 flex-1 cursor-pointer sm:w-44 sm:flex-none")}
          >
            <SelectValue>
              {(value) =>
                PRODUCT_SORTS.find((option) => option.value === value)?.label ??
                "Sort"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PRODUCT_SORTS.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className="cursor-pointer text-sm"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
