"use strict";

const mongoose = require("mongoose");
const { ZodError } = require("zod");
const env = require("../config/env");
const ApiError = require("../shared/ApiError");

/**
 * The only place in the application that converts an error into a response.
 *
 * Because Express 5 forwards rejected promises from async handlers to the
 * error chain automatically, controllers need no try/catch and no
 * `catchAsync` wrapper - a throw anywhere in a request lands here.
 *
 * Two responsibilities, and the split matters:
 *   - Translate known failure shapes (Zod, Mongoose, Mongo, JWT) into honest
 *     status codes and field-level messages the frontend can render.
 *   - Refuse to leak anything else. An unrecognised error is a bug; it is
 *     logged in full and answered with a bare 500, because driver messages
 *     and stack traces disclose schema and filesystem layout.
 */
function errorHandler(error, req, res, _next) {
  const normalised = normalise(error);

  const isServerFault = normalised.statusCode >= 500;
  const log = req.log ?? console;

  // 5xx is our bug and needs the stack; 4xx is the caller's mistake and would
  // just be log noise at error level.
  if (isServerFault) {
    log.error({ err: error, statusCode: normalised.statusCode }, normalised.logMessage);
  } else {
    log.warn(
      { statusCode: normalised.statusCode, code: normalised.code, path: req.originalUrl },
      normalised.logMessage
    );
  }

  const body = {
    success: false,
    // Mirrors the success envelope, so a client can read `statusCode` from the
    // body regardless of which branch it got.
    statusCode: normalised.statusCode,
    message: normalised.message,
    code: normalised.code,
    errors: normalised.errors,
  };

  if (req.id) body.requestId = req.id;

  // The stack is a development affordance only.
  if (!env.isProduction && error instanceof Error) body.stack = error.stack;

  res.status(normalised.statusCode).json(body);
}

function normalise(error) {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      code: error.code,
      errors: error.errors,
      logMessage: error.message,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 422,
      message: "Request validation failed",
      code: "VALIDATION_ERROR",
      errors: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
      logMessage: "Schema validation failed",
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: 422,
      message: "Request validation failed",
      code: "VALIDATION_ERROR",
      errors: Object.values(error.errors).map((fieldError) => ({
        field: fieldError.path,
        message: fieldError.message,
      })),
      logMessage: "Mongoose validation failed",
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    // Usually a malformed ObjectId in the path. Echoing `error.value` back
    // would reflect raw user input, so it is described rather than quoted.
    return {
      statusCode: 400,
      message: `Invalid value for '${error.path}'`,
      code: "INVALID_IDENTIFIER",
      errors: [{ field: error.path, message: `Expected a valid ${error.kind}` }],
      logMessage: "Cast error",
    };
  }

  // Duplicate key on a unique index.
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern ?? {})[0] ?? "field";
    return {
      statusCode: 409,
      message: `A record with this ${field} already exists`,
      code: "DUPLICATE_KEY",
      errors: [{ field, message: "Must be unique" }],
      logMessage: "Duplicate key",
    };
  }

  if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
    return {
      statusCode: 401,
      message: "Invalid or expired token",
      code: "TOKEN_INVALID",
      errors: [],
      logMessage: "JWT verification failed",
    };
  }

  // Thrown by express.json() on a malformed body.
  if (error instanceof SyntaxError && "body" in error) {
    return {
      statusCode: 400,
      message: "Request body is not valid JSON",
      code: "MALFORMED_JSON",
      errors: [],
      logMessage: "Malformed JSON body",
    };
  }

  if (error?.type === "entity.too.large") {
    return {
      statusCode: 413,
      message: "Request body is too large",
      code: "PAYLOAD_TOO_LARGE",
      errors: [],
      logMessage: "Payload too large",
    };
  }

  return {
    statusCode: 500,
    message: "Something went wrong",
    code: "INTERNAL_ERROR",
    errors: [],
    logMessage: error?.message ?? "Unhandled error",
  };
}

module.exports = errorHandler;
