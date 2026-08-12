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
const shape = {
  name: z.string().trim().min(1).max(240),
  slug,
  description: z.string().trim().min(1).max(100_000),
  shortDescription: z.string().trim().max(600).optional(),
  categoryId: objectId,
  brandId: objectId.optional(),
  productType: z.enum(PRODUCT_TYPE_VALUES).optional(),
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
  publishedAt: z.coerce.date().nullable().optional(),
};

const priceOrderIsValid = (body) =>
  body.originalPrice == null || body.sellingPrice == null || body.originalPrice >= body.sellingPrice;

const createProduct = {
  body: z.object({ ...shape, variationOptions: variationOptions.optional() }).strict().refine(priceOrderIsValid, {
    message: "originalPrice must not be less than sellingPrice",
    path: ["originalPrice"],
  }),
};
const updateProduct = {
  params: objectIdParam,
  body: z.object(shape).strict().refine(priceOrderIsValid, {
    message: "originalPrice must not be less than sellingPrice",
    path: ["originalPrice"],
  }),
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
      .default({}),
    pagination: z
      .object({
        page: z.coerce.number().int().min(0).default(PAGINATION.DEFAULT_PAGE),
        limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(24),
      })
      .strict()
      .default({}),
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
};
