"use strict";

const env = require("../../../config/env");
const ApiError = require("../../../shared/ApiError");
const logger = require("../../../config/logger");

/**
 * Facebook Login, server-side verification.
 *
 * The browser runs the Facebook SDK and ends up with a **user access token**,
 * which it posts here. The critical rule is that the token is never trusted
 * as presented - a client can send any string, including one obtained for a
 * different application. Two Graph calls establish the facts:
 *
 *   1. `debug_token` - is this token real, unexpired, and *issued to our
 *      app*? The `app_id` check is the one that matters: without it, anyone
 *      could take a token from any other Facebook app they control and sign
 *      in as that user here.
 *   2. `/me` - fetch the profile fields we actually need.
 *
 * `debug_token` is called with an app access token (`APP_ID|APP_SECRET`),
 * which is why the app secret must never reach the browser.
 */

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const TIMEOUT_MS = 8000;

const provider = "FACEBOOK";

function isConfigured() {
  return Boolean(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET);
}

function appAccessToken() {
  return `${env.FACEBOOK_APP_ID}|${env.FACEBOOK_APP_SECRET}`;
}

/**
 * A third party being slow must not tie up a request indefinitely.
 */
async function graphFetch(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body?.error?.message ?? `Graph API returned ${response.status}`;
    throw ApiError.unauthorized("Could not verify your Facebook sign-in", {
      code: "SOCIAL_VERIFICATION_FAILED",
      cause: new Error(message),
    });
  }

  return body;
}

/**
 * Verifies a Facebook user access token and returns a normalised profile.
 *
 * @param {string} token User access token from the Facebook SDK.
 * @returns {Promise<{provider: string, providerId: string, email: string|null, firstName: string, lastName: string, avatarUrl: string|null}>}
 */
async function verifyToken(token) {
  const debug = await graphFetch(
    `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}` +
      `&access_token=${encodeURIComponent(appAccessToken())}`
  );

  const data = debug?.data;

  if (!data?.is_valid) {
    throw ApiError.unauthorized("Your Facebook sign-in has expired. Please try again.", {
      code: "SOCIAL_TOKEN_INVALID",
    });
  }

  // The check that stops a token minted for someone else's Facebook app from
  // being replayed against ours.
  if (String(data.app_id) !== String(env.FACEBOOK_APP_ID)) {
    logger.warn(
      { presentedAppId: data.app_id },
      "Facebook token issued for a different app was presented"
    );
    throw ApiError.unauthorized("This Facebook sign-in is not valid for this application", {
      code: "SOCIAL_TOKEN_WRONG_AUDIENCE",
    });
  }

  if (data.expires_at && data.expires_at * 1000 <= Date.now()) {
    throw ApiError.unauthorized("Your Facebook sign-in has expired. Please try again.", {
      code: "SOCIAL_TOKEN_EXPIRED",
    });
  }

  const profile = await graphFetch(
    `${GRAPH}/me?fields=id,first_name,last_name,email,picture.width(256)` +
      `&access_token=${encodeURIComponent(token)}`
  );

  // `user_id` from debug_token is authoritative; `/me` is fetched with the
  // same token, but comparing them costs nothing and catches an odd response.
  if (data.user_id && profile.id && String(data.user_id) !== String(profile.id)) {
    throw ApiError.unauthorized("Facebook profile did not match the verified token", {
      code: "SOCIAL_PROFILE_MISMATCH",
    });
  }

  return {
    provider,
    providerId: String(profile.id),
    // Absent when the user registered with a phone number, or declined the
    // email permission. The caller decides what to do about that.
    email: profile.email ? String(profile.email).toLowerCase().trim() : null,
    firstName: profile.first_name?.trim() || "Facebook",
    lastName: profile.last_name?.trim() || "User",
    avatarUrl: profile.picture?.data?.url ?? null,
  };
}

module.exports = { provider, verifyToken, isConfigured, GRAPH_VERSION };
