"use strict";

const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const ApiError = require("./ApiError");
const { REFRESH_COOKIE_NAME } = require("./constants");

/**
 * Token strategy.
 *
 * Access token  - 15 minutes, sent in the Authorization header, never stored
 *                 by the server. Short life is what limits the damage of a
 *                 leaked token, since there is no revocation list to check.
 * Refresh token - 30 days, delivered as an httpOnly + SameSite cookie so
 *                 browser JavaScript (and therefore XSS) cannot read it.
 *                 Only its SHA-256 hash is persisted, so a database dump does
 *                 not hand an attacker usable sessions. It is rotated on
 *                 every refresh, which makes replay detectable.
 */

const ACCESS_AUDIENCE = "gadgetsimp:access";
const REFRESH_AUDIENCE = "gadgetsimp:refresh";

// User ids are integers, but the JWT `sub` claim is defined as a string. It
// is stringified here and cast back by Mongoose on lookup.
function subjectOf(user) {
  return String(user.id ?? user._id);
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: subjectOf(user), role: user.role, tokenVersion: user.tokenVersion },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
      audience: ACCESS_AUDIENCE,
      issuer: "gadgetsimp-api",
    }
  );
}

function signRefreshToken(user) {
  // `jti` gives each refresh token an identity, so a specific session can be
  // revoked without invalidating every device the user is signed in on.
  const jti = crypto.randomUUID();

  const token = jwt.sign(
    { sub: subjectOf(user), tokenVersion: user.tokenVersion },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      audience: REFRESH_AUDIENCE,
      issuer: "gadgetsimp-api",
      jwtid: jti,
    }
  );

  return { token, jti };
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      audience: ACCESS_AUDIENCE,
      issuer: "gadgetsimp-api",
    });
  } catch (error) {
    throw error.name === "TokenExpiredError"
      ? ApiError.unauthorized("Access token expired", { code: "TOKEN_EXPIRED", cause: error })
      : ApiError.unauthorized("Invalid access token", { code: "TOKEN_INVALID", cause: error });
  }
}

function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, {
      audience: REFRESH_AUDIENCE,
      issuer: "gadgetsimp-api",
    });
  } catch (error) {
    throw ApiError.unauthorized("Invalid or expired refresh token", {
      code: "REFRESH_TOKEN_INVALID",
      cause: error,
    });
  }
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    // 'lax' still sends the cookie on top-level navigation, which is what a
    // storefront needs, while blocking the cross-site POSTs that CSRF relies on.
    sameSite: env.isProduction ? "strict" : "lax",
    domain: env.COOKIE_DOMAIN,
    path: `${env.API_PREFIX}/auth`,
    maxAge: parseDuration(env.JWT_REFRESH_EXPIRES_IN),
  };
}

function parseDuration(value) {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
  if (!match) return 0;

  const amount = Number(match[1]);
  const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];

  return amount * unit;
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  refreshCookieOptions,
  parseDuration,
  REFRESH_COOKIE_NAME,
};
