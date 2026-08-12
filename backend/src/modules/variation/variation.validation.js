"use strict";

const { z } = require("zod");
const { objectId, objectIdParam } = require("../../shared/validators");
const { PAGINATION, PRODUCT_STATUS_VALUES, STOCK_STATUS_VALUES } = require("../../shared/constants");
const { image } = require("../../shared/catalogValidation");

const optionKey = z.string().regex(/^[a-z][a-z0-9_]*$/).max(80);
const partialStock = z.object({
  quantity: z.coerce.number().int().min(0).optional(),
  trackInventory: z.boolean().optional(),
  allowBackorder: z.boolean().optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  status: z.enum(STOCK_STATUS_VALUES).optional(),
}).strict().refine((body) => Object.keys(body).length > 0, { message: "At least one stock field is required" });

const generate = {
  body: z.object({
    options: z.record(
      optionKey,
      z.array(z.string().trim().min(1).max(120)).min(1).max(100)
        .refine((values) => new Set(values).size === values.length, { message: "Option values must be unique" })
    ),
  }).strict().refine((body) => Object.keys(body.options).length > 0, {
    message: "At least one variation option is required",
    path: ["options"],
  }),
};

const filter = {
  body: z.object({
    productId: objectId.optional(),
    search: z.string().trim().min(1).max(120).optional(),
    status: z.enum(PRODUCT_STATUS_VALUES).optional(),
    pagination: z.object({
      page: z.coerce.number().int().min(0).default(PAGINATION.DEFAULT_PAGE),
      limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
    }).strict().default({}),
  }).strict(),
};

const patch = {
  params: objectIdParam,
  body: z.object({
    sku: z.string().trim().min(1).max(120).optional(),
    barcode: z.string().trim().max(120).optional(),
    sellingPrice: z.coerce.number().min(0).optional(),
    originalPrice: z.coerce.number().min(0).optional(),
    stock: partialStock.optional(),
    status: z.enum(PRODUCT_STATUS_VALUES).optional(),
    image: image.optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
  }).strict()
    .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required" })
    .refine((body) => body.originalPrice == null || body.sellingPrice == null || body.originalPrice >= body.sellingPrice, {
      message: "originalPrice must not be less than sellingPrice",
      path: ["originalPrice"],
    }),
};

module.exports = { generate, filter, patch, byId: { params: objectIdParam } };
