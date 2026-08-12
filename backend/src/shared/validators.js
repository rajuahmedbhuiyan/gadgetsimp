"use strict";

const { z } = require("zod");
const { PAGINATION } = require("./constants");

/**
 * Zod fragments reused across modules.
 *
 * Validating an ObjectId's shape here means a malformed id is a clean 422
 * from the edge instead of a Mongoose CastError thrown from inside a service.
 */

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Must be a valid 24-character id");

const idParam = z.object({ id: objectId }).strict();

/**
 * Users are keyed by integer, so their path parameter is coerced from the
 * string Express hands over and checked for shape here. Without this, `/users/abc`
 * reaches Mongoose and surfaces as a CastError from inside a service rather
 * than a clean 422 from the edge.
 */
const integerId = z.coerce
  .number()
  .int("Must be a whole number")
  .positive("Must be a positive id");

const integerIdParam = z.object({ id: integerId }).strict();

/**
 * Base list query. Modules extend this with their own filters:
 *   listQuery.extend({ status: z.enum([...]).optional() })
 *
 * `coerce` matters because query strings arrive as text - without it every
 * page number would be the string "2" and comparisons would misbehave.
 */
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.MAX_LIMIT)
    .default(PAGINATION.DEFAULT_LIMIT),
  sort: z.string().max(120).optional(),
  fields: z.string().max(240).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

module.exports = { objectId, idParam, integerId, integerIdParam, listQuery };
