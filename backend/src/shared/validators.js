"use strict";

const { z } = require("zod");
const { PAGINATION } = require("./constants");

/**
 * Zod fragments reused across modules.
 *
 * Pared back to the integer id when the catalog modules were removed - the
 * ObjectId and generic list-query helpers went with them. They can come back
 * with the catalog; leaving unused validators behind just invites someone to
 * wire up the wrong one.
 */

/**
 * Users are keyed by integer, so their path parameter is coerced from the
 * string Express hands over and checked for shape here. Without this,
 * `/users/abc` reaches Mongoose and surfaces as a CastError from inside a
 * service rather than a clean 422 from the edge.
 */
const integerId = z.coerce
  .number()
  .int("Must be a whole number")
  .positive("Must be a positive id");

const integerIdParam = z.object({ id: integerId }).strict();

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Must be a valid identifier");

const objectIdParam = z.object({ id: objectId }).strict();

const pagination = z
  .object({
    page: z.coerce.number().int().min(0).default(PAGINATION.DEFAULT_PAGE),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(PAGINATION.MAX_LIMIT)
      .default(PAGINATION.DEFAULT_LIMIT),
  })
  .strict()
  .default({});

module.exports = { integerId, integerIdParam, objectId, objectIdParam, pagination };
