"use strict";

/**
 * The one function that writes a success body.
 *
 * Controllers call this instead of `res.json`, which guarantees every
 * endpoint answers in the same envelope. The frontend then has a single
 * response type to model rather than one per endpoint.
 */
function sendResponse(res, { statusCode = 200, message = "Success", data = null, meta, code } = {}) {
  // `statusCode` is echoed in the body as well as set on the response. It is
  // redundant over plain HTTP, but it survives the places the status line does
  // not: a logged payload, a webhook relay, a client whose HTTP wrapper only
  // hands back the parsed JSON. Errors carry the same field, so one shape
  // answers "what happened" without reaching for transport metadata.
  const body = { success: true, statusCode, message, data };

  /**
   * A machine-readable outcome, for the few successes that have more than one.
   *
   * The error envelope has always carried `code`; this mirrors it on the
   * success side so a client reads the same field either way. Set only when a
   * caller asks for it, because a code on every 200 would be noise - most
   * endpoints have exactly one way of succeeding and the status says it.
   *
   * `POST /auth/verify-email` is the case that needs it: confirming an address
   * either signs you in or asks for a password, and both are 200s that a
   * client must tell apart before deciding what to render.
   */
  if (code !== undefined) body.code = code;

  if (meta !== undefined) body.meta = meta;

  return res.status(statusCode).json(body);
}

/**
 * Builds the `meta` block for a paginated list.
 *
 * `page` is zero-based, so the last page is `totalPages - 1` and the boundary
 * checks below read off that rather than off `totalPages` itself.
 */
function paginationMeta({ page, limit, total }) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    page,
    limit,
    total,
    totalPages,
    // `page + 1 < totalPages`, not `page < totalPages`: on the final page
    // those differ, and the second would promise a page that is not there.
    hasNextPage: page + 1 < totalPages,
    hasPrevPage: page > 0,
  };
}

module.exports = { sendResponse, paginationMeta };
