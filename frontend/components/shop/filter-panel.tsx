"use client";

/**
 * The whole filter set, rendered once and placed twice - as a desktop sidebar
 * and inside the mobile drawer. Sharing the component is what keeps the two
 * from drifting apart as filters are added.
 *
 * Order is deliberate: category first, because it is the only filter that
 * changes which *other* filters exist. Everything below it is either universal
 * (brand, price, stock) or category-driven.
 */

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Brand, FilterGroup as Group, ShopCategory } from "@/lib/api/shop";
import type { RangeValue, ShopFilterState } from "@/lib/shop/filters";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterGroup } from "./filter-group";
import { RangeFilter } from "./range-filter";

export interface FilterPanelProps {
  filters: ShopFilterState;
  categories: ShopCategory[];
  brands: Brand[];
  groups: Group[];
  /** Bounds for the price slider, from the catalogue. */
  priceBounds: { min: number; max: number };
  loadingGroups: boolean;
  onToggleCategory: (slug: string) => void;
  onToggleBrand: (slug: string) => void;
  onPrice: (range: RangeValue | null) => void;
  onInStock: (value: boolean) => void;
  onToggleAttribute: (key: string, value: string) => void;
  onAttributeRange: (key: string, range: RangeValue | null) => void;
}

export function FilterPanel({
  filters,
  categories,
  brands,
  groups,
  priceBounds,
  loadingGroups,
  onToggleCategory,
  onToggleBrand,
  onPrice,
  onInStock,
  onToggleAttribute,
  onAttributeRange,
}: FilterPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      <CheckList
        legend="Category"
        // No count: `POST /shop/categories` does not return one, and the
        // listing endpoint returns no facets to derive it from.
        items={categories.map((category) => ({
          value: category.slug,
          label: category.name,
        }))}
        selected={filters.categories}
        onToggle={onToggleCategory}
      />

      <Separator />

      <CheckList
        legend="Brand"
        items={brands.map((brand) => ({ value: brand.slug, label: brand.name }))}
        selected={filters.brands}
        onToggle={onToggleBrand}
      />

      <Separator />

      <RangeFilter
        label="Price"
        min={priceBounds.min}
        max={priceBounds.max}
        value={filters.price}
        onChange={onPrice}
        prefix="৳"
      />

      <Separator />

      <label
        htmlFor="filter-in-stock"
        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/60"
      >
        <Checkbox
          id="filter-in-stock"
          checked={filters.inStock}
          onCheckedChange={(checked) => onInStock(checked === true)}
        />
        <span className="text-sm font-medium">In stock only</span>
      </label>

      {/*
        * Attribute filters, which exist only for a single selected category -
        * they are resolved against that category's configuration, and the
        * server rejects them without one.
        */}
      {filters.categories.length === 1 ? (
        loadingGroups ? (
          <>
            <Separator />
            <GroupsSkeleton />
          </>
        ) : groups.length > 0 ? (
          <>
            {groups.map((group) => (
              <div key={group.id} className="flex flex-col gap-5">
                <Separator />
                <FilterGroup
                  group={group}
                  value={filters.attributes[group.key]}
                  onToggle={(value) => onToggleAttribute(group.key, value)}
                  onRange={(range) => onAttributeRange(group.key, range)}
                />
              </div>
            ))}
          </>
        ) : null
      ) : filters.categories.length > 1 ? (
        <>
          <Separator />
          <p className="px-1.5 text-xs leading-relaxed text-muted-foreground">
            Pick a single category to filter by its own options, like colour or
            battery life.
          </p>
        </>
      ) : null}
    </div>
  );
}

function CheckList({
  legend,
  items,
  selected,
  onToggle,
}: {
  legend: string;
  items: { value: string; label: string; count?: number }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (items.length === 0) {
    return (
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">{legend}</legend>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">{legend}</legend>
      {/* Capped and scrolled rather than paginated: the sidebar must not grow
          taller than the grid beside it. */}
      <div
        className={cn(
          "flex flex-col gap-0.5",
          items.length > 8 && "max-h-64 overflow-y-auto pr-1",
        )}
      >
        {items.map((item) => {
          const id = `${legend}-${item.value}`;
          const checked = selected.includes(item.value);

          return (
            <label
              key={item.value}
              htmlFor={id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/60"
            >
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={() => onToggle(item.value)}
                className="shrink-0"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {item.label}
              </span>
              {item.count != null ? (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {item.count}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function GroupsSkeleton() {
  return (
    <div className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      Loading filters…
    </div>
  );
}
