"use strict";

const { z } = require("zod");
const {
  PRODUCT_STATUS_VALUES,
  PRODUCT_VISIBILITY_VALUES,
  PRODUCT_TYPE_VALUES,
  PAGINATION,
} = require("../../shared/constants");
const { objectId, objectIdParam } = require("../../shared/validators");
const {
  slug,
  seo,
  stock,
  weight,
  dimensions,
  image,
} = require("../../shared/catalogValidation");

const attributeKey = z.string().regex(/^[a-z][a-z0-9_]*$/).max(80);
const scalarValue = z.union([z.string().trim().max(500), z.number(), z.boolean()]);
const attributeValue = z.union([scalarValue, z.array(scalarValue).min(1).max(100)]);
const dynamicAttributes = z.record(attributeKey, attributeValue);
const variationOptions = z.record(
  attributeKey,
  z.array(z.string().trim().min(1).max(120)).min(1).max(100)
    .refine((values) => new Set(values).size === values.length, { message: "Option values must be unique" })
);
const variation = z.object({
  options: z.record(attributeKey, z.string().trim().min(1).max(120)),
  sku: z.string().trim().min(1).max(120).optional(),
  barcode: z.string().trim().max(120).optional(),
  sellingPrice: z.coerce.number().min(0).optional(),
  originalPrice: z.coerce.number().min(0).optional(),
  stock: stock.optional(),
  status: z.enum(PRODUCT_STATUS_VALUES).optional(),
  image: image.optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
}).strict().refine(
  (body) => body.originalPrice == null || body.sellingPrice == null || body.originalPrice >= body.sellingPrice,
  {
  message: "originalPrice must not be less than sellingPrice",
  path: ["originalPrice"],
  }
);
const shape = {
  name: z.string().trim().min(1).max(240),
  slug,
  description: z.string().trim().min(1).max(100_000),
  shortDescription: z.string().trim().max(600).optional(),
  categoryIds: z.array(objectId).min(1).max(20)
    .refine((ids) => new Set(ids).size === ids.length, { message: "Category ids must be unique" }),
  brandId: objectId.optional(),
  sku: z.string().trim().min(1).max(120).optional(),
  status: z.enum(PRODUCT_STATUS_VALUES).optional(),
  visibility: z.enum(PRODUCT_VISIBILITY_VALUES).optional(),
  featured: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  attributes: dynamicAttributes.default({}),
  currency: z.literal("BDT").default("BDT"),
  sellingPrice: z.coerce.number().min(0),
  originalPrice: z.coerce.number().min(0).optional(),
  stock: stock.optional(),
  shipping: z
    .object({
      requiresShipping: z.boolean().default(true),
      freeShipping: z.boolean().default(false),
      weight: weight.optional(),
      dimensions: dimensions.optional(),
    })
    .strict()
    .optional(),
  thumbnail: image,
  images: z.array(image).max(100).default([]),
  seo: seo.optional(),
};

const priceOrderIsValid = (body) =>
  body.originalPrice == null || body.sellingPrice == null || body.originalPrice >= body.sellingPrice;

const createProduct = {
  body: z.object({
    ...shape,
    productType: z.enum(PRODUCT_TYPE_VALUES).optional(),
    variationOptions: variationOptions.optional(),
    variations: z.array(variation).min(1).max(500).optional(),
  }).strict().refine(priceOrderIsValid, {
    message: "originalPrice must not be less than sellingPrice",
    path: ["originalPrice"],
  }),
};
const updateProduct = {
  params: objectIdParam,
  body: z.object({ ...shape, variationOptions: variationOptions.optional() }).strict().refine(priceOrderIsValid, {
    message: "originalPrice must not be less than sellingPrice",
    path: ["originalPrice"],
  }),
};

/**
 * Section patches.
 *
 * The admin UI edits a product one panel at a time, and `PUT /products/{id}`
 * requires the whole document - so saving a price change means round-tripping
 * every field, and any field the form did not load is silently reset. These
 * endpoints scope each save to the panel that produced it.
 *
 * Each schema is built from the same `shape` fragments as create/update, so a
 * rule cannot drift between the two paths. Each is `.strict()` (an unknown key
 * is a 422, not a silent no-op) and requires at least one field, because an
 * empty patch is always a client bug.
 *
 * Cross-field rules that span sections - `originalPrice >= sellingPrice`, or
 * attributes being valid for the category - cannot be checked here, because
 * the other half of the comparison lives in the database. The service does
 * those against the *merged* record.
 */
const atLeastOneField = (body) => Object.keys(body).length > 0;
const notEmpty = { message: "Provide at least one field to update" };

const patchGeneral = {
  params: objectIdParam,
  body: z
    .object({
      name: shape.name.optional(),
      slug: shape.slug.optional(),
      brandId: objectId.nullable().optional(),
      categoryIds: shape.categoryIds.optional(),
      sku: z.string().trim().min(1).max(120).optional(),
      status: z.enum(PRODUCT_STATUS_VALUES).optional(),
      visibility: z.enum(PRODUCT_VISIBILITY_VALUES).optional(),
      featured: z.boolean().optional(),
      /**
       * `productType` is absent on purpose. Flipping VARIABLE to SIMPLE would
       * orphan every generated SKU, and the reverse would leave a product
       * marked variable with nothing to buy. That is a migration, not a field
       * edit.
       */
    })
    .strict()
    .refine(atLeastOneField, notEmpty),
};

const patchDescription = {
  params: objectIdParam,
  body: z
    .object({
      description: shape.description.optional(),
      // Nullable so a short description can be cleared, not only replaced.
      shortDescription: z.string().trim().max(600).nullable().optional(),
    })
    .strict()
    .refine(atLeastOneField, notEmpty),
};

const patchPricing = {
  params: objectIdParam,
  body: z
    .object({
      sellingPrice: z.coerce.number().min(0).optional(),
      // Nullable so the struck-through "was" price can be removed.
      originalPrice: z.coerce.number().min(0).nullable().optional(),
      currency: z.literal("BDT").optional(),
    })
    .strict()
    .refine(atLeastOneField, notEmpty)
    // Only catches the case where both arrive together; one-sided patches are
    // checked against the stored value in the service.
    .refine(priceOrderIsValid, {
      message: "originalPrice must not be less than sellingPrice",
      path: ["originalPrice"],
    }),
};

const patchStock = {
  params: objectIdParam,
  body: z.object({ stock }).strict(),
};

const patchAttributes = {
  params: objectIdParam,
  body: z
    .object({
      attributes: dynamicAttributes.optional(),
      tags: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
    })
    .strict()
    .refine(atLeastOneField, notEmpty),
};

const patchMedia = {
  params: objectIdParam,
  body: z
    .object({
      thumbnail: image.optional(),
      images: z.array(image).max(100).optional(),
    })
    .strict()
    .refine(atLeastOneField, notEmpty),
};

/**
 * Single-purpose toggles, separate from `/general`.
 *
 * A product table wants one-click "feature this" and "publish this" actions,
 * and routing those through the general panel means the client has to know
 * which other fields that panel owns. These carry exactly one decision each.
 */
const patchFeatured = {
  params: objectIdParam,
  body: z.object({ featured: z.boolean() }).strict(),
};

const patchStatus = {
  params: objectIdParam,
  body: z
    .object({
      status: z.enum(PRODUCT_STATUS_VALUES).optional(),
      visibility: z.enum(PRODUCT_VISIBILITY_VALUES).optional(),
    })
    .strict()
    .refine(atLeastOneField, notEmpty),
};

const patchSeo = {
  params: objectIdParam,
  body: z.object({ seo }).strict(),
};

const rangeFilter = z
  .object({ min: z.coerce.number().optional(), max: z.coerce.number().optional() })
  .strict()
  .refine((range) => range.min != null || range.max != null, { message: "min or max is required" })
  .refine((range) => range.min == null || range.max == null || range.min <= range.max, {
    message: "min must not exceed max",
  });
const filterValue = z.union([
  z.array(z.union([z.string().trim().min(1).max(180), z.number()])).min(1).max(100),
  rangeFilter,
]);
const filters = z.record(attributeKey, filterValue).default({});

const catalogQueryShape = {
    categoryId: objectId.optional(),
    filters,
    search: z.string().trim().min(1).max(160).optional(),
    sort: z
      .object({
        field: z.enum(["relevance", "price", "name", "createdAt"]).default("createdAt"),
        direction: z.enum(["asc", "desc"]).default("desc"),
      })
      .strict()
      .prefault({}),
    pagination: z
      .object({
        page: z.coerce.number().int().min(0).default(PAGINATION.DEFAULT_PAGE),
        limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(24),
      })
      .strict()
      .prefault({}),
  };

const categoryRequiredForFilters = (body) => body.categoryId || Object.keys(body.filters).length === 0;

const catalogQuery = z
  .object(catalogQueryShape)
  .strict()
  .refine(categoryRequiredForFilters, {
    message: "categoryId is required when filters are supplied",
    path: ["categoryId"],
  });

const listProducts = { body: catalogQuery };
const productFilters = {
  body: z
    .object({
      categoryId: catalogQueryShape.categoryId,
      filters: catalogQueryShape.filters,
      search: catalogQueryShape.search,
    })
    .strict()
    .refine(categoryRequiredForFilters, {
      message: "categoryId is required when filters are supplied",
      path: ["categoryId"],
    }),
};
const productById = { params: objectIdParam };
module.exports = {
  createProduct,
  updateProduct,
  listProducts,
  productFilters,
  productById,
  patchGeneral,
  patchDescription,
  patchPricing,
  patchStock,
  patchAttributes,
  patchMedia,
  patchSeo,
  patchFeatured,
  patchStatus,
};
