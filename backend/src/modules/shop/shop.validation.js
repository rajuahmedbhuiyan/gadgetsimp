"use strict";

const { z } = require("zod");
const { PAGINATION } = require("../../shared/constants");

/**
 * The public storefront contract.
 *
 * Everything here is addressed by **slug**, not id. A shopper's URL is
 * `/shop/laptops`, not `/shop/6712f0c2a1b4d3e5f6a7b8c9`, so making the API
 * speak the same language removes a lookup from every page and keeps ObjectIds
 * - which leak nothing useful but read as internal plumbing - out of the
 * storefront entirely.
 */

const slugValue = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a lowercase hyphenated slug");

const attributeKey = z.string().regex(/^[a-z][a-z0-9_]*$/).max(80);

const rangeFilter = z
  .object({ min: z.coerce.number().optional(), max: z.coerce.number().optional() })
  .strict()
  .refine((range) => range.min != null || range.max != null, { message: "min or max is required" })
  .refine((range) => range.min == null || range.max == null || range.min <= range.max, {
    message: "min must not exceed max",
  });

/**
 * Dynamic filters: whatever the category configures. Keys are attribute keys,
 * values are either a list (OR within the filter) or a numeric range.
 * Different filters are ANDed.
 */
const dynamicFilters = z
  .record(
    attributeKey,
    z.union([
      z.array(z.union([z.string().trim().min(1).max(180), z.number()])).min(1).max(100),
      rangeFilter,
    ])
  )
  .default({});

/**
 * Static filters: properties every product has, regardless of category. Kept
 * as named fields rather than folded into `filters` so they are discoverable
 * in the docs and cannot collide with an attribute that happens to be called
 * "price".
 */
const shopFilter = {
  body: z
    .object({
      /**
       * A list, not a single slug: a storefront routinely shows more than one
       * category at once - a "Menswear" landing page spanning shirts and
       * trousers, or a multi-select in the sidebar. Each slug expands to its
       * own subtree and the results are unioned.
       */
      categorySlugs: z.array(slugValue).min(1).max(20).optional(),
      brandSlugs: z.array(slugValue).min(1).max(50).optional(),
      search: z.string().trim().min(1).max(160).optional(),

      filters: dynamicFilters,

      price: rangeFilter.optional(),
      inStock: z.boolean().optional(),
      featured: z.boolean().optional(),

      sort: z
        .object({
          field: z.enum(["relevance", "price", "name", "createdAt"]).default("createdAt"),
          direction: z.enum(["asc", "desc"]).default("desc"),
        })
        .strict()
        .prefault({}),

      pagination: z
        .object({
          // Zero-based, matching the rest of the API.
          page: z.coerce.number().int().min(0).default(PAGINATION.DEFAULT_PAGE),
          limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(24),
        })
        .strict()
        .prefault({}),
    })
    .strict()
    // Attribute filters are resolved from a category's configuration, so
    // without a category there is nothing to resolve them against.
    .refine((body) => body.categorySlugs?.length || Object.keys(body.filters).length === 0, {
      message: "categorySlugs is required when attribute filters are supplied",
      path: ["categorySlugs"],
    }),
};

/**
 * Filter options are a GET keyed by the category slug.
 *
 * The sidebar for a category is the same for every shopper and changes only
 * when the catalog does, so a GET is cacheable by the browser and any CDN in
 * front - which a POST never is. Narrowing counts by already-applied filters
 * is what `POST /shop` returns alongside the results, so there is no reason
 * for this to take a body.
 */
const shopFilterOptions = { params: z.object({ categorySlug: slugValue }).strict() };

/**
 * Storefront category list, for a home page or a nav menu.
 */
const shopCategories = {
  body: z
    .object({
      /**
       * Omit to ignore the flag entirely and return every category that has
       * something to sell; send `true` for the curated home-page set.
       */
      showInHome: z.boolean().optional(),

      /**
       * Escape hatch for an admin preview or a nav menu that wants the full
       * taxonomy: skips the "must have at least one product" rule. Named
       * explicitly so an empty category appearing on a live home page is
       * always a deliberate choice.
       */
      forceCategories: z.boolean().default(false),

      search: z.string().trim().min(1).max(120).optional(),

      pagination: z
        .object({
          page: z.coerce.number().int().min(0).default(PAGINATION.DEFAULT_PAGE),
          limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
        })
        .strict()
        .prefault({}),
    })
    .strict(),
};

const productBySlug = { params: z.object({ slug: slugValue }).strict() };

module.exports = { shopFilter, shopFilterOptions, shopCategories, productBySlug };
