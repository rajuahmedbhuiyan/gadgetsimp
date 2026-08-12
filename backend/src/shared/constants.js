"use strict";

/**
 * Domain vocabulary shared by models, validators and Swagger docs.
 * Defined once so an enum can never drift between the schema that stores it,
 * the validator that accepts it and the docs that advertise it.
 *
 * Cart / order / review vocabulary lands here when those modules land.
 */

/**
 * The four roles, stored with their `ROLE_` prefix exactly as written.
 * Code refers to `ROLES.ADMIN`; the database and JWT carry `"ROLE_ADMIN"`.
 */
const ROLES = Object.freeze({
  CUSTOMER: "ROLE_CUSTOMER",
  MODERATOR: "ROLE_MODERATOR",
  ADMIN: "ROLE_ADMIN",
  OWNER: "ROLE_OWNER",
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

/**
 * Roles are ranked, not a flat set, so permissions accumulate: an OWNER can do
 * everything an ADMIN can, and so on down. Ranks are spaced by 10 so a role
 * can be slotted between two existing ones later without renumbering.
 *
 * `authorize()` takes the *minimum* rank a route needs, which means a new role
 * above ADMIN inherits its access automatically instead of requiring every
 * route to be revisited and added to a list.
 */
const ROLE_RANK = Object.freeze({
  [ROLES.CUSTOMER]: 10,
  [ROLES.MODERATOR]: 20,
  [ROLES.ADMIN]: 30,
  [ROLES.OWNER]: 40,
});

function roleRank(role) {
  return ROLE_RANK[role] ?? 0;
}

function roleAtLeast(role, minimumRole) {
  return roleRank(role) >= roleRank(minimumRole);
}

/**
 * Roles a given actor is allowed to assign. An actor may never grant a role at
 * or above their own rank - otherwise any admin could mint another admin, or
 * promote themselves sideways past the owner.
 */
function assignableRoles(actorRole) {
  return ROLE_VALUES.filter((role) => roleRank(role) < roleRank(actorRole));
}

const PRODUCT_STATUS = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  ARCHIVED: "archived",
});

const PRODUCT_STATUS_VALUES = Object.freeze(Object.values(PRODUCT_STATUS));

/**
 * Money is stored as integer minor units (poisha/cents) everywhere. Floats
 * silently lose precision once you start summing line totals and applying
 * percentage discounts, and an ecommerce ledger cannot afford that. Formatting
 * back to major units is the client's job.
 */
const CURRENCY = Object.freeze({
  CODE: "BDT",
  MINOR_UNITS_PER_MAJOR: 100,
});

const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

/**
 * Brand palette, defined once so emails (and anything else server-rendered)
 * cannot drift from the frontend.
 *
 * `PRIMARY` is a bright amber with a relative luminance of 0.57. White text on
 * it measures 1.69:1 - far below the 4.5:1 WCAG AA threshold and genuinely
 * hard to read - so anything sitting on the brand colour uses `INK`
 * (10.3:1) rather than white. That is why the email buttons are dark-on-amber
 * and not the usual white-on-colour.
 */
const BRAND = Object.freeze({
  PRIMARY: "#febc01",
  PRIMARY_DARK: "#e0a500", // hover / borders
  INK: "#1a1a1a", // text on PRIMARY, and body copy
  MUTED: "#6b7280",
  SURFACE: "#ffffff",
  BACKGROUND: "#f4f4f5",
  BORDER: "#e5e7eb",
});

/**
 * How users can authenticate. `EMAIL` accounts have a password; social
 * accounts may not.
 */
const AUTH_PROVIDERS = Object.freeze({
  EMAIL: "EMAIL",
  FACEBOOK: "FACEBOOK",
  GOOGLE: "GOOGLE",
});

const AUTH_PROVIDER_VALUES = Object.freeze(Object.values(AUTH_PROVIDERS));

/**
 * The subset reachable through `POST /auth/social-login`. Derived from
 * AUTH_PROVIDERS rather than listed separately, so adding a provider in one
 * place cannot leave the two lists disagreeing.
 */
const SOCIAL_PROVIDERS = Object.freeze(
  AUTH_PROVIDER_VALUES.filter((provider) => provider !== AUTH_PROVIDERS.EMAIL)
);

const REFRESH_COOKIE_NAME = "gs_refresh_token";

/**
 * How long a verification link stays usable before the pending signup expires
 * and the email address is released again.
 *
 * Short on purpose: the link is a bearer credential that creates an account,
 * so a narrow window limits how long a forwarded, logged or intercepted email
 * remains usable. The cost is that a slow delivery can outlive the link, which
 * is what `/auth/resend-verification` is for - and why the expiry message
 * names the window rather than saying "expired" and leaving the user stuck.
 */
const EMAIL_VERIFICATION_TTL_MINUTES = 10;

module.exports = {
  ROLES,
  ROLE_VALUES,
  ROLE_RANK,
  roleRank,
  roleAtLeast,
  assignableRoles,
  PRODUCT_STATUS,
  PRODUCT_STATUS_VALUES,
  CURRENCY,
  PAGINATION,
  BRAND,
  AUTH_PROVIDERS,
  AUTH_PROVIDER_VALUES,
  SOCIAL_PROVIDERS,
  REFRESH_COOKIE_NAME,
  EMAIL_VERIFICATION_TTL_MINUTES,
};
