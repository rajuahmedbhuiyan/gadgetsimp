"use strict";

/**
 * The one function that writes a success body.
 *
 * Controllers call this instead of `res.json`, which guarantees every
 * endpoint answers in the same envelope. The frontend then has a single
 * response type to model rather than one per endpoint.
 */
function sendResponse(res, { statusCode = 200, message = "Success", data = null, meta } = {}) {
  // `statusCode` is echoed in the body as well as set on the response. It is
  // redundant over plain HTTP, but it survives the places the status line does
  // not: a logged payload, a webhook relay, a client whose HTTP wrapper only
  // hands back the parsed JSON. Errors carry the same field, so one shape
  // answers "what happened" without reaching for transport metadata.
  const body = { success: true, statusCode, message, data };

  if (meta !== undefined) body.meta = meta;

  return res.status(statusCode).json(body);
}

/**
 * Builds the `meta` block for a paginated list.
 */
function paginationMeta({ page, limit, total }) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

module.exports = { sendResponse, paginationMeta };
