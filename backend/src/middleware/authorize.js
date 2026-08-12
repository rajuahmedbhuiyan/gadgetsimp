"use strict";

const ApiError = require("../shared/ApiError");
const { roleAtLeast, ROLES } = require("../shared/constants");

/**
 * Role gate. Always mounted after `authenticate`.
 *
 * Kept separate from authentication because "who are you" and "may you do
 * this" fail differently: the first is a 401 the client fixes by signing in,
 * the second a 403 that signing in again will not fix.
 *
 * Takes the *minimum* role a route requires rather than a list of permitted
 * ones. `authorize(ROLES.ADMIN)` admits ADMIN and OWNER; `authorize(
 * ROLES.MODERATOR)` admits MODERATOR, ADMIN and OWNER. A list would mean
 * every new senior role had to be retro-fitted into every route that should
 * obviously already allow it - and the one route someone forgets is a
 * privilege bug rather than a compile error.
 *
 * @param {string} minimumRole
 */
function authorize(minimumRole) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized("Authentication required"));
    }

    if (!roleAtLeast(req.user.role, minimumRole)) {
      return next(
        ApiError.forbidden("You do not have permission to perform this action", {
          code: "INSUFFICIENT_ROLE",
        })
      );
    }

    return next();
  };
}

/**
 * Exact-role gate, for the rare case where seniority should *not* inherit -
 * an owner-only billing screen an admin must never reach, for example.
 *
 * @param {...string} exactRoles
 */
function authorizeExactly(...exactRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized("Authentication required"));
    }

    if (!exactRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden("You do not have permission to perform this action", {
          code: "INSUFFICIENT_ROLE",
        })
      );
    }

    return next();
  };
}

/**
 * Ownership gate for routes where a user may act on their own resource and
 * staff may act on anyone's.
 *
 * Role checks alone leave the classic IDOR hole: every customer passes
 * `authorize(ROLES.CUSTOMER)`, so without this any of them could read
 * `/users/42`.
 *
 * @param {(req: import("express").Request) => number|string} getOwnerId
 * @param {string} [staffRole] Minimum role that may act on anyone's resource.
 */
function authorizeSelfOrAbove(getOwnerId, staffRole = ROLES.MODERATOR) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized("Authentication required"));
    }

    if (roleAtLeast(req.user.role, staffRole)) return next();

    // User ids are integers; compare as numbers so "42" and 42 match.
    if (Number(getOwnerId(req)) === Number(req.user.id)) return next();

    // 404 rather than 403: confirming the resource exists would let a caller
    // enumerate other users' ids - and sequential integer ids make that
    // trivial to walk.
    return next(ApiError.notFound("Resource not found"));
  };
}

module.exports = { authorize, authorizeExactly, authorizeSelfOrAbove };
