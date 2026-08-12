"use strict";

const ApiError = require("../shared/ApiError");
const { verifyAccessToken } = require("../shared/tokens");
const User = require("../modules/user/user.model");
const { USER_STATUS } = require("../shared/constants");

/**
 * Verifies the bearer token and attaches the caller to `req.user`.
 *
 * The user is re-read from the database on every request rather than trusted
 * wholesale from the token claims. That costs one indexed lookup and buys
 * correctness: a demoted admin loses access immediately instead of when their
 * token happens to expire, and a deactivated account cannot keep shopping.
 *
 * `tokenVersion` is the revocation lever. Bumping it on the user document
 * invalidates every access token already issued to them - which is what
 * "log out everywhere" and "force re-auth after password change" need.
 */
async function authenticate(req, _res, next) {
  const token = extractToken(req);

  if (!token) {
    return next(ApiError.unauthorized("Authentication required", { code: "TOKEN_MISSING" }));
  }

  const payload = verifyAccessToken(token);

  const user = await User.findById(payload.sub).select("+tokenVersion");

  if (!user) {
    return next(ApiError.unauthorized("Account no longer exists", { code: "USER_NOT_FOUND" }));
  }

  if (!user.canSignIn()) {
    return next(
      ApiError.forbidden(
        user.status === USER_STATUS.DELETED
          ? "This account no longer exists"
          : "This account has been suspended",
        { code: "ACCOUNT_DISABLED" }
      )
    );
  }

  if (user.tokenVersion !== payload.tokenVersion) {
    return next(
      ApiError.unauthorized("Session has been revoked. Please sign in again.", {
        code: "TOKEN_REVOKED",
      })
    );
  }

  req.user = user;

  return next();
}

/**
 * Attaches the user when a valid token is present but never rejects.
 *
 * Used on catalog routes so one handler can serve both anonymous browsing and
 * personalised responses, and so signed-in shoppers are rate limited by user
 * id instead of sharing an IP bucket.
 */
async function optionalAuthenticate(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select("+tokenVersion");

    if (user?.canSignIn() && user.tokenVersion === payload.tokenVersion) {
      req.user = user;
    }
  } catch {
    // A bad token on a public route is simply an anonymous visitor.
  }

  return next();
}

function extractToken(req) {
  const header = req.headers.authorization;

  if (header?.startsWith("Bearer ")) {
    return header.slice(7).trim() || null;
  }

  return null;
}

module.exports = { authenticate, optionalAuthenticate };
