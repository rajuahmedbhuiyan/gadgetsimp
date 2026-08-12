"use strict";

const { z } = require("zod");
const {
  ATTRIBUTE_SOURCE_VALUES,
  ATTRIBUTE_TYPE_VALUES,
  CATALOG_STATUS_VALUES,
  PAGINATION,
} = require("../../shared/constants");
const { objectIdParam } = require("../../shared/validators");
const { slug } = require("../../shared/catalogValidation");

const shape = {
  name: z.string().trim().min(1).max(120),
  key: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers and underscores"),
  slug,
  description: z.string().trim().max(2000).optional(),
  source: z.enum(ATTRIBUTE_SOURCE_VALUES),
  type: z.enum(ATTRIBUTE_TYPE_VALUES),
  status: z.enum(CATALOG_STATUS_VALUES).optional(),
  min: z.coerce.number().optional(),
  max: z.coerce.number().optional(),
  display: z
    .object({
      helpText: z.string().trim().max(500).optional(),
      placeholder: z.string().trim().max(120).optional(),
      showInProductDetails: z.boolean().default(true),
    })
    .strict()
    .optional(),
};

function validRange(data) {
  if (data.type === "range") {
    return data.min != null && data.max != null && data.min <= data.max;
  }
  return data.min == null && data.max == null;
}

const createAttribute = {
  body: z.object(shape).strict().refine(validRange, {
    message: "Range attributes require min and max, and min must not exceed max",
    path: ["min"],
  }),
};

const updateAttribute = {
  params: objectIdParam,
  body: z.object(shape).strict().refine(validRange, {
    message: "Range attributes require min and max, and min must not exceed max",
    path: ["min"],
  }),
};

const listAttributes = {
  body: z
    .object({
      search: z.string().trim().min(1).max(120).optional(),
      source: z.enum(ATTRIBUTE_SOURCE_VALUES).optional(),
      type: z.enum(ATTRIBUTE_TYPE_VALUES).optional(),
      status: z.enum(CATALOG_STATUS_VALUES).optional(),
      page: z.coerce.number().int().min(0).default(PAGINATION.DEFAULT_PAGE),
      limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
    })
    .strict(),
};

const attributeById = { params: objectIdParam };

module.exports = { createAttribute, updateAttribute, listAttributes, attributeById };
