"use client";

/**
 * The shop's filter state, held in the URL.
 *
 * `nuqs` keeps the querystring and React in step, so every control here is
 * really editing the address bar. That is what makes a filtered grid something
 * a shopper can bookmark or send to someone, and it is why there is no
 * reducer: the URL already is the state.
 *
 * Changing any filter clears the scroll position implicitly by resetting the
 * infinite query - see `use-shop-products`, which keys on this state.
 */

import { useCallback, useMemo } from "react";
import {
  parseAsBoolean,
  parseAsFloat,
  parseAsString,
  useQueryStates,
} from "nuqs";

import {
  DEFAULT_SORT,
  decodeAttributes,
  decodeList,
  encodeAttributes,
  encodeList,
  type RangeValue,
  type ShopFilterState,
} from "@/lib/shop/filters";

export function useShopFilters() {
  const [raw, setRaw] = useQueryStates(
    {
      category: parseAsString.withDefault(""),
      brand: parseAsString.withDefault(""),
      q: parseAsString.withDefault(""),
      min: parseAsFloat,
      max: parseAsFloat,
      stock: parseAsBoolean.withDefault(false),
      sort: parseAsString.withDefault(DEFAULT_SORT),
      f: parseAsString.withDefault(""),
    },
    {
      // Filters are a refinement of one page, not a trail of separate ones:
      // Back should leave the shop, not walk every checkbox in reverse.
      history: "replace",
      // Keeps the grid on screen while the new results load.
      shallow: true,
      clearOnDefault: true,
    },
  );

  const filters: ShopFilterState = useMemo(
    () => ({
      categories: decodeList(raw.category),
      brands: decodeList(raw.brand),
      search: raw.q,
      price: {
        ...(raw.min != null ? { min: raw.min } : {}),
        ...(raw.max != null ? { max: raw.max } : {}),
      },
      inStock: raw.stock,
      sort: raw.sort,
      attributes: decodeAttributes(raw.f),
    }),
    [raw],
  );

  /* ------------------------------- setters ------------------------------- */

  const setCategories = useCallback(
    (categories: string[]) => {
      /*
       * Attribute filters are cleared with the category, not kept.
       *
       * They are resolved against a category's own configuration, so a
       * `strap_size` carried over into Chargers means nothing - and the server
       * refuses attribute filters without a category at all, so keeping them
       * while clearing the category would produce a 422 instead of a grid.
       */
      void setRaw({ category: encodeList(categories) || null, f: null });
    },
    [setRaw],
  );

  const setBrands = useCallback(
    (brands: string[]) => {
      void setRaw({ brand: encodeList(brands) || null });
    },
    [setRaw],
  );

  const setSearch = useCallback(
    (search: string) => {
      void setRaw({ q: search || null });
    },
    [setRaw],
  );

  const setPrice = useCallback(
    (price: RangeValue) => {
      void setRaw({ min: price.min ?? null, max: price.max ?? null });
    },
    [setRaw],
  );

  const setInStock = useCallback(
    (inStock: boolean) => {
      void setRaw({ stock: inStock || null });
    },
    [setRaw],
  );

  const setSort = useCallback(
    (sort: string) => {
      void setRaw({ sort: sort === DEFAULT_SORT ? null : sort });
    },
    [setRaw],
  );

  const setAttribute = useCallback(
    (key: string, value: string[] | RangeValue | null) => {
      const next = { ...decodeAttributes(raw.f) };

      if (
        value === null ||
        (Array.isArray(value) && value.length === 0) ||
        (!Array.isArray(value) && value.min == null && value.max == null)
      ) {
        delete next[key];
      } else {
        next[key] = value;
      }

      void setRaw({ f: encodeAttributes(next) || null });
    },
    [raw.f, setRaw],
  );

  /** Tick or untick one value inside a multi-select attribute. */
  const toggleAttributeValue = useCallback(
    (key: string, value: string) => {
      const current = decodeAttributes(raw.f)[key];
      const list = Array.isArray(current) ? current : [];
      const next = list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value];

      setAttribute(key, next);
    },
    [raw.f, setAttribute],
  );

  /** Everything except the search term, which is its own control. */
  const clearFilters = useCallback(() => {
    void setRaw({
      category: null,
      brand: null,
      min: null,
      max: null,
      stock: null,
      f: null,
    });
  }, [setRaw]);

  const clearAll = useCallback(() => {
    void setRaw({
      category: null,
      brand: null,
      q: null,
      min: null,
      max: null,
      stock: null,
      sort: null,
      f: null,
    });
  }, [setRaw]);

  return {
    filters,
    setCategories,
    setBrands,
    setSearch,
    setPrice,
    setInStock,
    setSort,
    setAttribute,
    toggleAttributeValue,
    clearFilters,
    clearAll,
  };
}
