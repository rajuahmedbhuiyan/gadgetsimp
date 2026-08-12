"use strict";

/**
 * The single error type the application throws.
 *
 * Services throw `ApiError`; the error middleware is the only place that
 * turns one into a response. Controllers therefore contain no try/catch and
 * no status-code juggling, and an error raised four layers deep still reaches
 * the client with the right status.
 *
 * Anything thrown that is *not* an ApiError is treated as a bug: it is logged
 * with a stack and reported as a generic 500, never leaked to the client.
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status to send.
   * @param {string} message Client-safe message.
   * @param {object} [options]
   * @param {Array<{field: string, message: string}>} [options.errors] Field-level detail.
   * @param {string} [options.code] Stable machine-readable code for clients.
   * @param {Error} [options.cause] Underlying error, logged but never sent.
   */
  constructor(statusCode, message, { errors = [], code, cause } = {}) {
    super(message, cause ? { cause } : undefined);

    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code ?? defaultCode(statusCode);

    // Distinguishes "expected, thrown on purpose" from "unhandled crash".
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = "Bad request", options) {
    return new ApiError(400, message, options);
  }

  static unauthorized(message = "Authentication required", options) {
    return new ApiError(401, message, options);
  }

  static forbidden(message = "You do not have permission to perform this action", options) {
    return new ApiError(403, message, options);
  }

  static notFound(message = "Resource not found", options) {
    return new ApiError(404, message, options);
  }

  static conflict(message = "Resource already exists", options) {
    return new ApiError(409, message, options);
  }

  static unprocessable(message = "Validation failed", options) {
    return new ApiError(422, message, options);
  }

  static tooManyRequests(message = "Too many requests", options) {
    return new ApiError(429, message, options);
  }

  static internal(message = "Something went wrong", options) {
    return new ApiError(500, message, options);
  }
}

function defaultCode(statusCode) {
  return (
    {
      400: "BAD_REQUEST",
      401: "UNAUTHORIZED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT",
      422: "VALIDATION_ERROR",
      429: "RATE_LIMIT_EXCEEDED",
      500: "INTERNAL_ERROR",
      503: "SERVICE_UNAVAILABLE",
    }[statusCode] ?? "ERROR"
  );
}

module.exports = ApiError;
