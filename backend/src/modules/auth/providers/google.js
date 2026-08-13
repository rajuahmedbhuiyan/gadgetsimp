"use strict";

const { OAuth2Client } = require("google-auth-library");
const env = require("../../../config/env");
const ApiError = require("../../../shared/ApiError");
const logger = require("../../../config/logger");

/**
 * Google Sign-In, server-side verification.
 *
 * Google's flow differs from Facebook's in a way that matters. The browser
 * receives an **ID token** - a signed JWT containing the profile - rather than
 * an opaque access token. So verification is cryptographic and local: check
 * the signature against Google's published keys, then check the claims. There
 * is no per-login round trip to Google, and no client secret involved.
 *
 * `verifyIdToken` enforces the parts that actually provide the security:
 *
 *   - **signature** against Google's JWKS (the library fetches and caches the
 *     keys, and handles their rotation);
 *   - **`aud`** equals our client ID - the equivalent of Facebook's app_id
 *     check, and what stops an ID token issued for a different Google app
 *     from being replayed here to sign in as that user;
 *   - **`iss`** is accounts.google.com;
 *   - **`exp`** has not passed.
 *
 * Doing this by hand - decoding the JWT and trusting its contents - is the
 * classic way this integration gets built insecurely, because an unverified
 * JWT is just attacker-supplied JSON.
 */

const provider = "GOOGLE";

let client = null;

function isConfigured() {
  return Boolean(env.GOOGLE_CLIENT_ID);
}

function getClient() {
  if (!client) client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  return client;
}

/**
 * Verifies a Google ID token and returns a normalised profile.
 *
 * @param {string} token The `credential` (ID token) from Google Identity Services.
 * @returns {Promise<{provider: string, providerId: string, email: string|null, fullName: string, avatarUrl: string|null}>}
 */
async function verifyToken(token) {
  let payload;

  try {
    const ticket = await getClient().verifyIdToken({
      idToken: token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (error) {
    // The library reports audience mismatch, bad signature and expiry through
    // the same exception type, so the message is inspected to give the caller
    // something more useful than "invalid token".
    const message = String(error?.message ?? "");

    if (/audience/i.test(message)) {
      logger.warn({ err: error }, "Google ID token issued for a different client");
      throw ApiError.unauthorized("This Google sign-in is not valid for this application", {
        code: "SOCIAL_TOKEN_WRONG_AUDIENCE",
        cause: error,
      });
    }

    if (/expired|Token used too late/i.test(message)) {
      throw ApiError.unauthorized("Your Google sign-in has expired. Please try again.", {
        code: "SOCIAL_TOKEN_EXPIRED",
        cause: error,
      });
    }

    throw ApiError.unauthorized("Could not verify your Google sign-in", {
      code: "SOCIAL_TOKEN_INVALID",
      cause: error,
    });
  }

  if (!payload?.sub) {
    throw ApiError.unauthorized("Google sign-in returned no account identifier", {
      code: "SOCIAL_TOKEN_INVALID",
    });
  }

  /**
   * Google can return an address it has not confirmed the user owns. Trusting
   * it would let someone create or link a social identity under an address
   * they do not own. Only a Google-verified address may identify an account.
   */
  if (payload.email && payload.email_verified === false) {
    throw ApiError.unauthorized(
      "Your Google account's email address is not verified. Please verify it with Google and try again.",
      { code: "SOCIAL_EMAIL_UNVERIFIED" }
    );
  }

  return {
    provider,
    providerId: String(payload.sub),
    email: payload.email ? String(payload.email).toLowerCase().trim() : null,
    /**
     * `name` is the display name Google itself uses, so it is preferred over
     * re-joining `given_name` and `family_name` - those are absent on some
     * accounts, and in the name orders that put the family name first,
     * concatenating them produces a name the person does not go by. The pair
     * is the fallback for the accounts that lack `name`, and a placeholder
     * after that, since the field is required.
     */
    fullName:
      payload.name?.trim() ||
      [payload.given_name, payload.family_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      "Google User",
    avatarUrl: payload.picture ?? null,
  };
}

module.exports = { provider, verifyToken, isConfigured };
