"use strict";

const { ZodError } = require("zod");
const ApiError = require("../shared/ApiError");

/**
 * Schema validation at the edge.
 *
 * Every route that accepts input runs through here, so by the time a
 * controller executes, its input is known-good, coerced to the right types
 * and stripped of unknown keys. Services can then be written against real
 * values instead of defensively re-checking everything.
 *
 * Results land on `req.validated` rather than overwriting `req.query`:
 * in Express 5 `req.query` is a lazily-computed getter with no setter, so
 * assigning to it throws. Controllers read `req.validated.query`.
 *
 * @param {{body?: import("zod").ZodType, query?: import("zod").ZodType, params?: import("zod").ZodType}} schemas
 */
function validate(schemas) {
  return (req, _res, next) => {
    const validated = {};
    const issues = [];

    for (const source of ["params", "query", "body"]) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source]);

      if (result.success) {
        validated[source] = result.data;
      } else {
        issues.push(...formatIssues(result.error, source));
      }
    }

    if (issues.length > 0) {
      return next(
        ApiError.unprocessable("Request validation failed", { errors: issues })
      );
    }

    req.validated = validated;

    // `req.body` has a setter, so keeping it in sync means middleware further
    // down the chain (the auth limiter reads `req.body.email`) sees the
    // normalised value.
    if (validated.body !== undefined) req.body = validated.body;

    return next();
  };
}

function formatIssues(error, source) {
  const zodError = error instanceof ZodError ? error : null;
  if (!zodError) return [{ field: source, message: "Invalid input" }];

  return zodError.issues.map((issue) => ({
    field: [source, ...issue.path].join("."),
    message: issue.message,
  }));
}

module.exports = validate;
