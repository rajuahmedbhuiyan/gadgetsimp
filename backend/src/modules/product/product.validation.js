"use strict";

const { z } = require("zod");
const { objectId, idParam, listQuery } = require("../../shared/validators");
const { PRODUCT_STATUS_VALUES } = require("../../shared/constants");

// Prices cross the wire as integer minor units, matching how they are stored.
// Accepting decimal major units here would reintroduce the float rounding the
// storage model exists to avoid.
const minorUnits = z
  .number()
  .int("Amount must be an integer number of poisha (1 BDT = 100)")
  .min(0)
  .max(100_000_000_000);

const imageSchema = z
  .object({
    url: z.url("Enter a valid image URL").max(512),
    alt: z.string().trim().max(160).optional(),
  })
  .strict();

const variantSchema = z
  .object({
    sku: z.string().trim().min(1).max(64),
    attributes: z.record(z.string(), z.string().max(120)).default({}),
    price: minorUnits,
    compareAtPrice: minorUnits.nullable().optional(),
    stock: z.number().int().min(0).default(0),
    imageUrl: z.url().max(512).optional(),
    isActive: z.boolean().default(true),
  })
  .strict();

const createProduct = {
  body: z
    .object({
      title: z.string().trim().min(3).max(180),
      description: z.string().trim().max(5000).optional(),
      summary: z.string().trim().max(300).optional(),
      brand: z.string().trim().max(80).optional(),
      category: objectId,
      price: minorUnits,
      compareAtPrice: minorUnits.nullable().optional(),
      stock: z.number().int().min(0).default(0),
      lowStockThreshold: z.number().int().min(0).max(10_000).default(5),
      sku: z.string().trim().min(1).max(64).optional(),
      images: z.array(imageSchema).max(12).default([]),
      variants: z.array(variantSchema).max(50).default([]),
      attributes: z.record(z.string(), z.string().max(200)).default({}),
      tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
      status: z.enum(PRODUCT_STATUS_VALUES).default("draft"),
      isFeatured: z.boolean().default(false),
    })
    .strict()
    // Ratings and soldCount are computed from real events, never submitted.
    .refine((data) => data.variants.length === 0 || data.variants.every((v) => v.sku), {
      message: "Every variant needs a SKU",
      path: ["variants"],
    })
    .refine(
      (data) => {
        const skus = data.variants.map((variant) => variant.sku.toUpperCase());
        return new Set(skus).size === skus.length;
      },
      { message: "Variant SKUs must be unique within a product", path: ["variants"] }
    ),
};

const updateProduct = {
  params: idParam,
  body: z
    .object({
      title: z.string().trim().min(3).max(180).optional(),
      description: z.string().trim().max(5000).optional(),
      summary: z.string().trim().max(300).optional(),
      brand: z.string().trim().max(80).optional(),
      category: objectId.optional(),
      price: minorUnits.optional(),
      compareAtPrice: minorUnits.nullable().optional(),
      stock: z.number().int().min(0).optional(),
      lowStockThreshold: z.number().int().min(0).max(10_000).optional(),
      sku: z.string().trim().min(1).max(64).optional(),
      images: z.array(imageSchema).max(12).optional(),
      variants: z.array(variantSchema).max(50).optional(),
      attributes: z.record(z.string(), z.string().max(200)).optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
      status: z.enum(PRODUCT_STATUS_VALUES).optional(),
      isFeatured: z.boolean().optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: "Provide at least one field to update",
    }),
};

const listProducts = {
  query: listQuery
    .extend({
      category: z.string().trim().max(120).optional(), // id or slug
      brand: z.string().trim().max(80).optional(),
      tags: z.string().trim().max(200).optional(),
      status: z.enum(PRODUCT_STATUS_VALUES).optional(),
      minPrice: z.coerce.number().int().min(0).optional(),
      maxPrice: z.coerce.number().int().min(0).optional(),
      inStock: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),
      isFeatured: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),
      minRating: z.coerce.number().min(0).max(5).optional(),
    })
    .strict()
    .refine(
      (data) => data.minPrice == null || data.maxPrice == null || data.minPrice <= data.maxPrice,
      { message: "minPrice cannot be greater than maxPrice", path: ["minPrice"] }
    ),
};

const productBySlug = {
  params: z.object({ slug: z.string().trim().min(1).max(200) }).strict(),
};

const productById = { params: idParam };

const adjustStock = {
  params: idParam,
  body: z
    .object({
      // Signed delta rather than an absolute value: two admins receiving
      // stock at once would otherwise overwrite each other's count.
      delta: z.number().int().refine((value) => value !== 0, "Delta cannot be zero"),
      variantSku: z.string().trim().max(64).optional(),
      reason: z.string().trim().max(200).optional(),
    })
    .strict(),
};

module.exports = {
  createProduct,
  updateProduct,
  listProducts,
  productBySlug,
  productById,
  adjustStock,
};
