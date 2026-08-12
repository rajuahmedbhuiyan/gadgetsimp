"use strict";

/**
 * Strips Mongo operator syntax from user input.
 *
 * `{ "email": { "$gt": "" } }` posted to a login route matches the first user
 * in the collection unless something removes it. Mongoose's `sanitizeFilter`
 * (set in config/database.js) is the primary defence; this is the second
 * layer, catching operators before they reach any hand-built query.
 *
 * The popular `express-mongo-sanitize` package is deliberately not used: it
 * reassigns `req.query`, which throws on Express 5 where that property is a
 * getter. This walks the objects in place instead.
 */

const FORBIDDEN_KEY = /^\$|\./;

function scrub(value, depth = 0) {
  // Bounded recursion - a deeply nested payload should not blow the stack.
  if (depth > 10 || value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const entry of value) scrub(entry, depth + 1);
    return;
  }

  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEY.test(key)) {
      delete value[key];
      continue;
    }
    scrub(value[key], depth + 1);
  }
}

function sanitize(req, _res, next) {
  // `req.query` is read-only on Express 5 but the object it returns is still
  // mutable, so keys can be deleted from it in place.
  scrub(req.body);
  scrub(req.params);
  scrub(req.query);

  next();
}

module.exports = sanitize;
