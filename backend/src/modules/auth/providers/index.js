"use strict";

const ApiError = require("../../../shared/ApiError");
const { AUTH_PROVIDERS } = require("../../../shared/constants");
const facebook = require("./facebook");
const google = require("./google");

/**
 * Social provider registry.
 *
 * Every provider exposes the same three things - `provider`, `isConfigured()`
 * and `verifyToken(token)` returning a normalised profile - so the auth
 * service never branches on which one is in play. All the per-vendor
 * difference (Facebook's opaque access token verified over HTTP, Google's
 * signed ID token verified cryptographically) is absorbed here.
 *
 * Adding a provider is adding one file and one line to this map.
 */
const registry = Object.freeze({
  [AUTH_PROVIDERS.FACEBOOK]: facebook,
  [AUTH_PROVIDERS.GOOGLE]: google,
});

/**
 * @param {string} type FACEBOOK | GOOGLE
 */
function getProvider(type) {
  const entry = registry[type];

  if (!entry) {
    throw ApiError.badRequest(`Unsupported sign-in provider: ${type}`, {
      code: "SOCIAL_PROVIDER_UNSUPPORTED",
    });
  }

  // Configured per provider, so the API can ship with Google enabled and
  // Facebook not - and says so plainly instead of failing mid-verification.
  if (!entry.isConfigured()) {
    throw new ApiError(503, `${type} sign-in is not configured on this server`, {
      code: "SOCIAL_PROVIDER_NOT_CONFIGURED",
    });
  }

  return entry;
}

/**
 * Which providers this deployment can actually serve. Exposed through
 * /auth/providers so a frontend renders only the buttons that will work,
 * rather than showing a Google button that 503s.
 */
function configuredProviders() {
  return Object.entries(registry)
    .filter(([, entry]) => entry.isConfigured())
    .map(([type]) => type);
}

module.exports = { getProvider, configuredProviders, registry };
