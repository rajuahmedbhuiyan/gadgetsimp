"use client";

/**
 * What is currently narrowing the grid, as removable chips.
 *
 * The sidebar shows what you *could* pick; this shows what you *have* picked,
 * which on mobile is otherwise hidden behind a drawer. Every chip removes
 * exactly one thing, so backing out of an over-filtered search is one tap
 * rather than a hunt through the panel.
 */

import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { formatPrice } from "@/lib/format";
import type { Brand, FilterGroup, ShopCategory } from "@/lib/api/shop";
import { formatFilterLabel, formatFilterValue } from "@/lib/shop/labels";
import type { RangeValue, ShopFilterState } from "@/lib/shop/filters";

interface Chip {
  id: string;
  label: string;
  onRemove: () => void;
}

export function ActiveFilters({
  filters,
  categories,
  brands,
  groups,
  onToggleCategory,
  onToggleBrand,
  onPrice,
  onInStock,
  onToggleAttribute,
  onAttributeRange,
  onClearAll,
}: {
  filters: ShopFilterState;
  categories: ShopCategory[];
  brands: Brand[];
  groups: FilterGroup[];
  onToggleCategory: (slug: string) => void;
  onToggleBrand: (slug: string) => void;
  onPrice: (range: RangeValue | null) => void;
  onInStock: (value: boolean) => void;
  onToggleAttribute: (key: string, value: string) => void;
  onAttributeRange: (key: string, range: RangeValue | null) => void;
  onClearAll: () => void;
}) {
  const chips: Chip[] = [];

  for (const slug of filters.categories) {
    // Falls back to the slug: the category list may still be loading, and a
    // chip that renders nothing is worse than one showing a raw slug.
    const name = categories.find((c) => c.slug === slug)?.name ?? slug;
    chips.push({
      id: `category-${slug}`,
      label: name,
      onRemove: () => onToggleCategory(slug),
    });
  }

  for (const slug of filters.brands) {
    const name = brands.find((b) => b.slug === slug)?.name ?? slug;
    chips.push({
      id: `brand-${slug}`,
      label: name,
      onRemove: () => onToggleBrand(slug),
    });
  }

  if (filters.price.min != null || filters.price.max != null) {
    chips.push({
      id: "price",
      label: priceLabel(filters.price),
      onRemove: () => onPrice(null),
    });
  }

  if (filters.inStock) {
    chips.push({
      id: "stock",
      label: "In stock",
      onRemove: () => onInStock(false),
    });
  }

  for (const [key, value] of Object.entries(filters.attributes)) {
    const group = groups.find((g) => g.key === key);
    const groupLabel = group ? formatFilterLabel(group.label) : key;

    if (Array.isArray(value)) {
      for (const item of value) {
        const option = group?.options.find((o) => o.value === item);
        chips.push({
          id: `${key}-${item}`,
          label: formatFilterValue(item, option?.label),
          onRemove: () => onToggleAttribute(key, item),
        });
      }
      continue;
    }

    chips.push({
      id: `${key}-range`,
      label: `${groupLabel}: ${value.min ?? "0"}–${value.max ?? "∞"}`,
      onRemove: () => onAttributeRange(key, null),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AnimatePresence initial={false} mode="popLayout">
        {chips.map((chip) => (
          <motion.button
            key={chip.id}
            layout
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.15 }}
            type="button"
            onClick={chip.onRemove}
            className="group flex cursor-pointer items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 py-1.5 pr-2 pl-3 text-xs font-medium transition-colors hover:border-brand/60 hover:bg-brand/20"
          >
            {chip.label}
            <X
              className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground"
              aria-hidden
            />
            <span className="sr-only">Remove filter</span>
          </motion.button>
        ))}
      </AnimatePresence>

      {chips.length > 1 ? (
        <button
          type="button"
          onClick={onClearAll}
          className="cursor-pointer rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}

function priceLabel(price: RangeValue) {
  if (price.min != null && price.max != null) {
    return `${formatPrice(price.min)} – ${formatPrice(price.max)}`;
  }
  if (price.min != null) return `From ${formatPrice(price.min)}`;
  return `Up to ${formatPrice(price.max!)}`;
}
