"use strict";

const ApiError = require("../shared/ApiError");

/**
 * Terminal 404 handler.
 *
 * Mounted with a bare `app.use` and no path. Express 5 moved to
 * path-to-regexp v8, where the old `app.use('*', ...)` catch-all is a syntax
 * error - wildcards must now be named, e.g. `/*splat`. A pathless `use`
 * sidesteps the question entirely and is the clearer expression anyway.
 */
function notFound(req, _res, next) {
  next(
    ApiError.notFound(`Cannot ${req.method} ${req.originalUrl}`, { code: "ROUTE_NOT_FOUND" })
  );
}

module.exports = notFound;
