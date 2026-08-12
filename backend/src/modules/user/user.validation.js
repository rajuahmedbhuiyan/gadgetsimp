"use strict";

const { z } = require("zod");
const { integerIdParam, listQuery } = require("../../shared/validators");
const { ROLE_VALUES } = require("../../shared/constants");
const { nameSchema, phoneSchema } = require("../auth/auth.validation");

const updateProfile = {
  // `.strict()` rejects unknown keys outright rather than silently dropping
  // them, so a client sending `role` or `isActive` here gets a clear 422
  // instead of quietly believing it worked.
  body: z
    .object({
      firstName: nameSchema.optional(),
      lastName: nameSchema.optional(),
      phone: phoneSchema.optional(),
      avatarUrl: z.url("Enter a valid URL").max(512).optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: "Provide at least one field to update",
    }),
};

const listUsers = {
  query: listQuery
    .extend({
      role: z.enum(ROLE_VALUES).optional(),
      isActive: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),
    })
    .strict(),
};

const getUser = { params: integerIdParam };

const updateRole = {
  params: integerIdParam,
  body: z.object({ role: z.enum(ROLE_VALUES) }).strict(),
};

const updateStatus = {
  params: integerIdParam,
  body: z.object({ isActive: z.boolean() }).strict(),
};

module.exports = {
  updateProfile,
  listUsers,
  getUser,
  updateRole,
  updateStatus,
};
