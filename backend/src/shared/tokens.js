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

/**
 * Mints an access token.
 *
 * The identity claims below are a **convenience copy for the client**, not an
 * authorisation input. Two things follow from that, and both matter:
 *
 *   - **They can be stale.** A token is valid for 15 minutes, so a name or
 *     phone changed in that window is out of date inside the token. That is
 *     harmless here only because `authenticate` re-reads the user from the
 *     database on every request and `req.user` comes from there - nothing
 *     server-side trusts these values.
 *   - **They are readable by anyone holding the token.** A JWT is signed, not
 *     encrypted: the payload is plain base64. So this is fine for a name and
 *     role, and is the reason nothing sensitive beyond contact details goes in.
 */
function signAccessToken(user) {
  return jwt.sign(
    {
      sub: subjectOf(user),
      role: user.role,
      tokenVersion: user.tokenVersion,

      // Client-facing identity, so a frontend can render a header without a
      // round trip to /auth/me on every page load.
      fullName: user.fullName,
      email: user.email,
      phone: user.phone ?? null,
    },
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

/**
 * Cookie attributes for the refresh token.
 *
 * `sameSite` is the attribute that most often makes a refresh token look
 * "broken", so it is configurable rather than hard-coded:
 *
 *   - **lax** (default) - correct when the frontend and API share a site.
 *     Ports do not count, so localhost:3000 -> localhost:4000 is same-site and
 *     works; so is gadgetsimp.dev -> api.gadgetsimp.dev.
 *   - **none** - required when they are genuinely cross-site (a Vercel
 *     frontend calling an API on another domain). The browser then *silently
 *     drops* a lax/strict cookie on every request, which presents exactly as
 *     "the refresh token is not generating". `none` demands `secure`, so it
 *     only works over HTTPS.
 *   - **strict** - tightest, but the cookie is withheld on any cross-site
 *     request at all.
 *
 * `path` is `/` so the storefront's own server receives the cookie too.
 *
 * Scoping it to `${API_PREFIX}/auth` is tighter and was the earlier setting,
 * but it also means the browser withholds the cookie from every request that
 * is not aimed at these routes - including the document request that renders
 * the storefront. That makes server-side rendering of a signed-in page
 * impossible: the frontend's middleware has no credential to refresh with, so
 * the session can only ever be established after JavaScript boots.
 *
 * Widening the path does not widen who can read it. It stays httpOnly, so no
 * script sees it on either origin, and `sameSite` still governs cross-site
 * sends. What it costs is that the cookie now rides along on catalog and order
 * requests where it is not needed.
 *
 * In production the frontend and API must share a parent domain for this to
 * work - set COOKIE_DOMAIN=.yourdomain.tld. On localhost they already share a
 * host, because cookies ignore ports.
 */
function refreshCookieOptions() {
  return {
    httpOnly: true, // unreadable to JavaScript, so XSS cannot steal it
    secure: env.isProduction || env.COOKIE_SAMESITE === "none",
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    path: "/",
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
