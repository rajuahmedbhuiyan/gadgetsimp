/**
 * The shop's filter state, and how it maps to the URL and to the API.
 *
 * The URL is the single source of truth. Every control writes to it and the
 * query reads from it, which is what makes a filtered grid shareable, keeps
 * the Back button meaningful, and survives a refresh - none of which a
 * `useState` sidebar gives you.
 *
 * Attribute filters cannot be named up front: they come from
 * `GET /shop/filter-options/{categorySlug}` and differ per category. So they
 * live under a single `f` parameter with a compact encoding rather than one
 * query key per attribute, which would need a schema the page cannot know.
 */

import type { ShopQuery, ShopSortField } from "@/lib/api/shop";

/* --------------------------------- sort ---------------------------------- */

export interface SortOption {
  value: string;
  label: string;
  /**
   * For the closed trigger on a narrow screen, where the full label costs more
   * width than the rest of the toolbar has to give. Only ever the collapsed
   * state - the open list uses `label`, because that is where someone is
   * actually reading the choices.
   */
  short: string;
  field: ShopSortField;
  direction: "asc" | "desc";
}

/**
 * One flat list, because a shopper picks "cheapest first", not a field and a
 * direction separately. `relevance` is deliberately absent: it only means
 * anything with a search term, and the resolver below swaps it in.
 */
export const SORT_OPTIONS: SortOption[] = [
  { value: "newest", label: "Newest", short: "Newest", field: "createdAt", direction: "desc" },
  { value: "price-asc", label: "Price: low to high", short: "Price ↑", field: "price", direction: "asc" },
  { value: "price-desc", label: "Price: high to low", short: "Price ↓", field: "price", direction: "desc" },
  { value: "name-asc", label: "Name: A to Z", short: "A–Z", field: "name", direction: "asc" },
  { value: "name-desc", label: "Name: Z to A", short: "Z–A", field: "name", direction: "desc" },
];

export const DEFAULT_SORT = "newest";

/* ------------------------------ filter state ------------------------------ */

/** A numeric attribute range, as the API expects it. */
export interface RangeValue {
  min?: number;
  max?: number;
}

/** Everything the grid is filtered by, decoded from the URL. */
export interface ShopFilterState {
  categories: string[];
  brands: string[];
  search: string;
  price: RangeValue;
  inStock: boolean;
  sort: string;
  /** Attribute key -> chosen values, or a numeric range. */
  attributes: Record<string, string[] | RangeValue>;
}

export const EMPTY_FILTERS: ShopFilterState = {
  categories: [],
  brands: [],
  search: "",
  price: {},
  inStock: false,
  sort: DEFAULT_SORT,
  attributes: {},
};

/* -------------------------- attribute encoding ---------------------------- */

/*
 * `f=color:black,blue;battery_life:18..60`
 *
 * Semicolons separate attributes, a colon splits key from value, commas
 * separate list members, and `..` marks a range. None of those characters are
 * legal in an attribute key (`^[a-z][a-z0-9_]*$`) or in a slug value, so the
 * encoding cannot collide with the data it carries.
 */
const ATTR_SEPARATOR = ";";
const KEY_SEPARATOR = ":";
const LIST_SEPARATOR = ",";
const RANGE_SEPARATOR = "..";

export function encodeAttributes(
  attributes: Record<string, string[] | RangeValue>,
): string {
  const parts: string[] = [];

  // Sorted so the same selection always produces the same URL - two shoppers
  // ticking the same boxes in a different order should share the same link.
  for (const key of Object.keys(attributes).sort()) {
    const value = attributes[key];
    if (!value) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      parts.push(`${key}${KEY_SEPARATOR}${[...value].sort().join(LIST_SEPARATOR)}`);
      continue;
    }

    if (value.min == null && value.max == null) continue;
    parts.push(
      `${key}${KEY_SEPARATOR}${value.min ?? ""}${RANGE_SEPARATOR}${value.max ?? ""}`,
    );
  }

  return parts.join(ATTR_SEPARATOR);
}

export function decodeAttributes(
  raw: string | null | undefined,
): Record<string, string[] | RangeValue> {
  if (!raw) return {};

  const attributes: Record<string, string[] | RangeValue> = {};

  for (const part of raw.split(ATTR_SEPARATOR)) {
    // `indexOf`, not `split`: only the first colon separates key from value.
    const split = part.indexOf(KEY_SEPARATOR);
    if (split <= 0) continue;

    const key = part.slice(0, split).trim();
    const value = part.slice(split + 1).trim();
    if (!key || !value) continue;

    if (value.includes(RANGE_SEPARATOR)) {
      const [min, max] = value.split(RANGE_SEPARATOR);
      const range: RangeValue = {};
      if (min) range.min = Number(min);
      if (max) range.max = Number(max);
      // A range that parsed to nothing usable is a malformed URL, not a filter.
      if (Number.isFinite(range.min) || Number.isFinite(range.max)) {
        if (!Number.isFinite(range.min)) delete range.min;
        if (!Number.isFinite(range.max)) delete range.max;
        attributes[key] = range;
      }
      continue;
    }

    const values = value.split(LIST_SEPARATOR).map((v) => v.trim()).filter(Boolean);
    if (values.length > 0) attributes[key] = values;
  }

  return attributes;
}

/** `a,b,c` -> `["a","b","c"]`, tolerant of stray spaces and empties. */
export function decodeList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(LIST_SEPARATOR).map((v) => v.trim()).filter(Boolean);
}

export function encodeList(values: string[]): string {
  return [...values].sort().join(LIST_SEPARATOR);
}

/* ---------------------------- state -> request ---------------------------- */

/**
 * Build the `POST /shop` body.
 *
 * Two server rules are honoured here rather than left to a 422:
 *
 * - attribute filters need at least one category, because they are resolved
 *   against that category's configuration;
 * - `relevance` only sorts meaningfully when there is a search term, so it is
 *   substituted in only then, and the chosen sort applies otherwise.
 */
export function toShopQuery(
  state: ShopFilterState,
  page: number,
  limit: number,
): ShopQuery {
  const sort =
    SORT_OPTIONS.find((option) => option.value === state.sort) ??
    SORT_OPTIONS[0]!;

  const query: ShopQuery = {
    sort: { field: sort.field, direction: sort.direction },
    pagination: { page, limit },
  };

  if (state.categories.length > 0) query.categorySlugs = state.categories;
  if (state.brands.length > 0) query.brandSlugs = state.brands;
  if (state.search) query.search = state.search;
  if (state.inStock) query.inStock = true;

  if (state.price.min != null || state.price.max != null) {
    query.price = state.price;
  }

  /*
   * Dropped rather than sent when no category is selected. The server refuses
   * the combination outright, and a 422 in place of a grid is a worse answer
   * than quietly ignoring filters that cannot apply - the sidebar only offers
   * them once a category is chosen anyway.
   */
  if (state.categories.length > 0) {
    const attributes = Object.entries(state.attributes).filter(([, value]) =>
      Array.isArray(value)
        ? value.length > 0
        : value.min != null || value.max != null,
    );

    if (attributes.length > 0) {
      query.filters = Object.fromEntries(attributes) as ShopQuery["filters"];
    }
  }

  return query;
}

/* -------------------------------- counting -------------------------------- */

/** How many filters are applied, for the mobile button's badge. */
export function countActiveFilters(state: ShopFilterState): number {
  let count = 0;
  count += state.categories.length;
  count += state.brands.length;
  if (state.inStock) count += 1;
  if (state.price.min != null || state.price.max != null) count += 1;

  for (const value of Object.values(state.attributes)) {
    if (Array.isArray(value)) count += value.length;
    else if (value.min != null || value.max != null) count += 1;
  }

  return count;
}

export function hasAnyFilter(state: ShopFilterState): boolean {
  return countActiveFilters(state) > 0 || state.search.length > 0;
}
