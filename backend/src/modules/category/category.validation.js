"use strict";

const { z } = require("zod");
const { objectId, idParam, listQuery } = require("../../shared/validators");

const createCategory = {
  body: z
    .object({
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().max(500).optional(),
      imageUrl: z.url("Enter a valid URL").max(512).optional(),
      parent: objectId.nullable().optional(),
      displayOrder: z.coerce.number().int().min(0).max(9999).default(0),
      isActive: z.boolean().default(true),
    })
    .strict(),
};

const updateCategory = {
  params: idParam,
  body: z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      description: z.string().trim().max(500).optional(),
      imageUrl: z.url("Enter a valid URL").max(512).optional(),
      parent: objectId.nullable().optional(),
      displayOrder: z.coerce.number().int().min(0).max(9999).optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: "Provide at least one field to update",
    }),
};

const listCategories = {
  query: listQuery
    .extend({
      parent: objectId.optional(),
      isActive: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),
      // Returns a nested tree instead of a flat page.
      tree: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),
    })
    .strict(),
};

const categoryBySlug = {
  params: z
    .object({ slug: z.string().trim().min(1).max(120) })
    .strict(),
};

const categoryById = { params: idParam };

module.exports = {
  createCategory,
  updateCategory,
  listCategories,
  categoryBySlug,
  categoryById,
};
