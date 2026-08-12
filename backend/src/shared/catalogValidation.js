"use strict";

const { z } = require("zod");

const image = z.object({
  alt: z.string().trim().max(180).default(""),
  src: z.string().trim().min(1).max(1024),
  id: z.coerce.number().int().positive().optional(),
}).strict();
const {
  CATALOG_STATUS_VALUES,
  VISIBILITY_VALUES,
  CURRENCY_VALUES,
  STOCK_STATUS_VALUES,
} = require("./constants");
const { objectId } = require("./validators");

const optionalUrl = z.string().trim().url().max(1024).optional();

const seo = z
  .object({
    title: z.string().trim().max(70).optional(),
    description: z.string().trim().max(320).optional(),
    keywords: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    canonicalUrl: optionalUrl,
    noIndex: z.boolean().default(false),
    noFollow: z.boolean().default(false),
    ogTitle: z.string().trim().max(95).optional(),
    ogDescription: z.string().trim().max(300).optional(),
    ogImage: optionalUrl,
    twitterTitle: z.string().trim().max(70).optional(),
    twitterDescription: z.string().trim().max(200).optional(),
    twitterImage: optionalUrl,
  })
  .strict();

const mediaReference = z
  .object({
    mediaId: z.coerce.number().int().positive().optional(),
    url: optionalUrl,
    altText: z.string().trim().max(180).optional(),
    type: z.enum(["IMAGE", "VIDEO"]).default("IMAGE"),
    sortOrder: z.coerce.number().int().min(0).default(0),
  })
  .strict()
  .refine((value) => value.mediaId != null || value.url, {
    message: "Either mediaId or url is required",
    path: ["mediaId"],
  });

const money = z
  .object({
    amount: z.coerce.number().min(0),
    currency: z.enum(CURRENCY_VALUES).default("BDT"),
  })
  .strict();

const weight = z
  .object({
    value: z.coerce.number().min(0),
    unit: z.enum(["g", "kg", "oz", "lb"]).default("kg"),
  })
  .strict();

const dimensions = z
  .object({
    length: z.coerce.number().min(0),
    width: z.coerce.number().min(0),
    height: z.coerce.number().min(0),
    unit: z.enum(["mm", "cm", "m", "in"]).default("cm"),
  })
  .strict();

const stock = z
  .object({
    quantity: z.coerce.number().int().min(0).default(0),
    trackInventory: z.boolean().default(true),
    allowBackorder: z.boolean().default(false),
    lowStockThreshold: z.coerce.number().int().min(0).default(5),
    status: z.enum(STOCK_STATUS_VALUES).optional(),
  })
  .strict();

const slug = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a URL-safe lowercase slug");

const entityBase = {
  name: z.string().trim().min(1).max(160),
  slug,
  description: z.string().trim().max(10_000).optional(),
  status: z.enum(CATALOG_STATUS_VALUES).optional(),
  visibility: z.enum(VISIBILITY_VALUES).optional(),
  seo: seo.optional(),
};

const auditFields = {
  createdBy: objectId.optional(),
  updatedBy: objectId.optional(),
};

module.exports = {
  image,
  optionalUrl,
  seo,
  mediaReference,
  money,
  weight,
  dimensions,
  stock,
  slug,
  entityBase,
  auditFields,
};
