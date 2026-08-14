"use client";

/**
 * The bar above the grid: how many results, how they are sorted, and - below
 * `lg`, where the sidebar is not on screen - the way into the filters.
 *
 * The count is live rather than decorative. It is the fastest signal that a
 * filter did something, and on mobile it is the only one visible while the
 * drawer is open over the grid.
 */

import { SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { SORT_OPTIONS } from "@/lib/shop/filters";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Both controls in this bar, so they cannot drift apart again. */
const CONTROL_HEIGHT = "h-11";

function optionFor(value: string) {
  return SORT_OPTIONS.find((option) => option.value === value);
}

export function ShopToolbar({
  total,
  isLoading,
  sort,
  onSortChange,
  activeCount,
  onOpenFilters,
}: {
  total: number;
  isLoading: boolean;
  sort: string;
  onSortChange: (value: string) => void;
  activeCount: number;
  onOpenFilters: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p
        // Announced, so a filter change is not a silent update for anyone
        // using a screen reader - the grid itself gives no spoken feedback.
        aria-live="polite"
        /*
         * Hidden below 600px, but `sr-only` rather than `hidden`: the count is
         * the only spoken confirmation that a filter did anything, and
         * removing the element would take that away from exactly the people
         * who cannot see the grid change.
         */
        className="sr-only text-sm text-muted-foreground min-[600px]:not-sr-only"
      >
        {isLoading ? (
          "Loading products…"
        ) : (
          <>
            <span className="font-semibold text-foreground tabular-nums">
              {total}
            </span>{" "}
            {total === 1 ? "product" : "products"}
          </>
        )}
      </p>

      {/* The count collapses to nothing below 600px, so the controls spread
          across the row instead of huddling at its right edge. */}
      <div className="flex flex-1 items-center justify-between gap-2 min-[600px]:flex-none min-[600px]:justify-end">
        <Button
          variant="outline"
          onClick={onOpenFilters}
          className={cn(CONTROL_HEIGHT, "shrink-0 cursor-pointer gap-2 rounded-field px-3.5 text-sm font-medium lg:hidden")}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filters
          {activeCount > 0 ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-foreground tabular-nums">
              {activeCount}
            </span>
          ) : null}
        </Button>

        <Select
          value={sort}
          onValueChange={(value) => onSortChange(String(value))}
        >
          <SelectTrigger
            aria-label="Sort products"
            /*
             * The height goes through the same `data-size` variant the
             * primitive uses (`data-[size=default]:h-8`). A bare `h-11` is the
             * same specificity, so which one won came down to stylesheet
             * order - it lost, and the trigger sat 8px shorter than the
             * Filters button beside it. Matching the variant lets
             * tailwind-merge drop the original outright.
             */
            className={cn(
              "data-[size=default]:h-11 w-auto cursor-pointer rounded-field text-sm min-[600px]:w-52",
            )}
          >
            {/*
              * Without children, Base UI prints the raw stored value - the
              * trigger read "newest" rather than "Newest", and "price-asc"
              * rather than "Price: low to high".
              *
              * Two spellings, swapped by width rather than truncated. Below
              * 600px the row also carries the Filters button, and "Sort:
              * Price: low to high" simply does not fit beside it - so that
              * width gets the abbreviation and drops the prefix, which is
              * only there to stop a bare adjective reading as a status.
              */}
            <SelectValue>
              {(value) => {
                const option = optionFor(String(value));
                return (
                  <>
                    <span className="min-[600px]:hidden">{option?.short}</span>
                    <span className="hidden min-[600px]:inline">
                      Sort: {option?.label}
                    </span>
                  </>
                );
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
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
