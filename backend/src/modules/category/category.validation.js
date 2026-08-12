"use strict";

const { z } = require("zod");
const {
  CATALOG_STATUS_VALUES,
  VISIBILITY_VALUES,
  PAGINATION,
} = require("../../shared/constants");
const { objectId, objectIdParam } = require("../../shared/validators");
const { slug, seo } = require("../../shared/catalogValidation");

const shape = {
  name: z.string().trim().min(1).max(160),
  slug,
  description: z.string().trim().max(10_000).optional(),
  parentId: objectId.nullable().optional(),
  status: z.enum(CATALOG_STATUS_VALUES).optional(),
  visibility: z.enum(VISIBILITY_VALUES).optional(),
  image: z.string().trim().min(1).max(1024).optional(),
  attributes: z.array(objectId).max(100).default([]),
  seo: seo.optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
};

const createCategory = { body: z.object(shape).strict() };

const updateCategory = {
  params: objectIdParam,
  body: z.object(shape).strict(),
};

const listCategories = {
  body: z
    .object({
      parentId: objectId.nullable().optional(),
      search: z.string().trim().min(1).max(120).optional(),
      pagination: z
        .object({
          page: z.coerce.number().int().min(0).default(PAGINATION.DEFAULT_PAGE),
          limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
        })
        .strict()
        .default({}),
    })
    .strict(),
};

const filterGroupedCategories = {
  body: z
    .object({
      parentId: objectId.nullable().optional(),
      search: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
};

const sortCategories = {
  body: z
    .object({
      categories: z
        .array(
          z
            .object({
              id: objectId,
              parentId: objectId.nullable().optional(),
              sortOrder: z.coerce.number().int().min(0),
            })
            .strict()
        )
        .min(1)
        .max(500),
    })
    .strict()
    .refine(
      (body) => new Set(body.categories.map((category) => category.id)).size === body.categories.length,
      { message: "Each category id may appear only once", path: ["categories"] }
    ),
};

const categoryById = { params: objectIdParam };

module.exports = {
  createCategory,
  updateCategory,
  listCategories,
  filterGroupedCategories,
  sortCategories,
  categoryById,
};
