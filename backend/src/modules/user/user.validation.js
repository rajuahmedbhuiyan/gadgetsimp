"use strict";

const { z } = require("zod");
const { integerIdParam } = require("../../shared/validators");
const {
  ROLE_VALUES,
  USER_STATUS_VALUES,
  PAGINATION,
} = require("../../shared/constants");
const {
  nameSchema,
  phoneSchema,
  emailSchema,
  passwordSchema,
} = require("../auth/auth.validation");

const imageSchema = z.url("Enter a valid image URL").max(512);

const createUser = {
  body: z
    .object({
      firstName: nameSchema,
      lastName: nameSchema,
      email: emailSchema,
      /**
       * Optional by design. Omit it and the API generates one, emails it to
       * the new user, and returns it once in the response so the creator can
       * relay it out of band.
       */
      password: passwordSchema.optional(),
      // Absent means ROLE_CUSTOMER. The service still refuses any role at or
      // above the creator's own rank.
      role: z.enum(ROLE_VALUES).optional(),
      phone: phoneSchema.optional(),
      image: imageSchema.optional(),
      // Lets the owner create an account silently, e.g. when they will hand
      // over the credentials in person.
      sendEmail: z.boolean().default(true),
    })
    .strict(),
};

const updateProfile = {
  // `.strict()` rejects unknown keys outright rather than silently dropping
  // them, so a client sending `role` or `status` here gets a clear 422
  // instead of quietly believing it worked.
  body: z
    .object({
      firstName: nameSchema.optional(),
      lastName: nameSchema.optional(),
      phone: phoneSchema.optional(),
      image: imageSchema.optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: "Provide at least one field to update",
    }),
};

/**
 * Filters for `POST /users`.
 *
 * A POST with a JSON body rather than a GET with a query string, because the
 * filter set is open-ended: arrays of roles and statuses, date ranges, and
 * whatever gets added later. Encoding that in a query string means repeated
 * keys and bracket syntax that every client has to agree on, and it runs into
 * URL length limits. A typed body sidesteps all of it.
 *
 * The trade-off is that this is a non-idempotent verb for a read, so it is
 * not cacheable and reads oddly to REST purists. For an authenticated admin
 * screen neither costs anything.
 */
const filterUsers = {
  body: z
    .object({
      page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(PAGINATION.MAX_LIMIT)
        .default(PAGINATION.DEFAULT_LIMIT),

      // Free text across name and email.
      search: z.string().trim().min(1).max(120).optional(),

      // Single value or a list - `role: "ROLE_ADMIN"` and
      // `role: ["ROLE_ADMIN", "ROLE_OWNER"]` both work.
      role: z
        .union([z.enum(ROLE_VALUES), z.array(z.enum(ROLE_VALUES)).min(1)])
        .optional(),
      status: z
        .union([z.enum(USER_STATUS_VALUES), z.array(z.enum(USER_STATUS_VALUES)).min(1)])
        .optional(),

      emailVerified: z.boolean().optional(),

      createdFrom: z.coerce.date().optional(),
      createdTo: z.coerce.date().optional(),

      sortBy: z
        .enum(["createdAt", "lastLoginAt", "firstName", "lastName", "email", "role", "status"])
        .default("createdAt"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),

      /**
       * Soft-deleted accounts are hidden unless asked for. A deleted user
       * turning up in a routine admin list is confusing, and it is the kind
       * of default that quietly leaks removed people into exports.
       */
      includeDeleted: z.boolean().default(false),
    })
    .strict()
    .refine(
      (data) => !data.createdFrom || !data.createdTo || data.createdFrom <= data.createdTo,
      { message: "createdFrom must be before createdTo", path: ["createdFrom"] }
    ),
};

const getUser = { params: integerIdParam };

const updateRole = {
  params: integerIdParam,
  body: z.object({ role: z.enum(ROLE_VALUES) }).strict(),
};

const updateStatus = {
  params: integerIdParam,
  body: z
    .object({
      // DELETED is reachable only through the delete endpoint, so that a
      // removal always goes through the code that also revokes sessions and
      // stamps `deletedAt`.
      status: z.enum(["ACTIVE", "SUSPENDED"]),
    })
    .strict(),
};

const deleteUser = { params: integerIdParam };

module.exports = {
  createUser,
  updateProfile,
  filterUsers,
  getUser,
  updateRole,
  updateStatus,
  deleteUser,
};
