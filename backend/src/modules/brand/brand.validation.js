"use strict";

const { z } = require("zod");
const { CATALOG_STATUS_VALUES, VISIBILITY_VALUES, PAGINATION } = require("../../shared/constants");
const { objectIdParam } = require("../../shared/validators");
const { slug, seo, optionalUrl } = require("../../shared/catalogValidation");

const shape = {
  name: z.string().trim().min(1).max(160),
  slug,
  description: z.string().trim().max(10_000).optional(),
  logo: z.string().trim().min(1).max(1024).optional(),
  website: optionalUrl,
  status: z.enum(CATALOG_STATUS_VALUES).optional(),
  visibility: z.enum(VISIBILITY_VALUES).optional(),
  seo: seo.optional(),
  publishedAt: z.coerce.date().nullable().optional(),
};

const createBrand = { body: z.object(shape).strict() };
const updateBrand = {
  params: objectIdParam,
  body: z.object(shape).strict(),
};
const listBrands = {
  body: z
    .object({
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
const brandById = { params: objectIdParam };

module.exports = { createBrand, updateBrand, listBrands, brandById };
