"use strict";

/**
 * Domain vocabulary shared by models, validators and Swagger docs.
 * Defined once so an enum can never drift between the schema that stores it,
 * the validator that accepts it and the docs that advertise it.
 *
 * Catalog, cart and order vocabulary lands here when those modules land.
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

/**
 * Pages are **zero-based**: the first page is `page: 0`.
 *
 * That matches what table components on the frontend expect (MUI DataGrid,
 * TanStack Table) and keeps the skip arithmetic honest - `skip = page * limit`
 * rather than an off-by-one waiting to happen.
 */
const PAGINATION = Object.freeze({
  FIRST_PAGE: 0,
  DEFAULT_PAGE: 0,
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
 * Account lifecycle, replacing the old `isActive` boolean.
 *
 * A boolean could only ever say "on" or "off", which conflated two very
 * different situations: an account a moderator suspended, and one that was
 * deleted. They need different handling - a suspension is reversible and the
 * user should be told, a deletion should vanish from listings - and a string
 * enum leaves room for the states that always arrive later (PENDING, BANNED)
 * without another schema migration.
 *
 * Note the spelling: SUSPENDED, not "SUSPENSED". Enum values end up in
 * client code, stored rows and support scripts, so a typo here is permanent.
 */
const USER_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  DELETED: "DELETED",
});

const USER_STATUS_VALUES = Object.freeze(Object.values(USER_STATUS));

// The states that may hold a session. Anything else is refused at sign-in and
// has its existing sessions revoked.
const SIGN_IN_ALLOWED_STATUSES = Object.freeze([USER_STATUS.ACTIVE]);

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

/**
 * Media uploads.
 *
 * The size cap is enforced twice: multer aborts the stream once the limit is
 * passed, so an oversized body is never fully buffered, and the service checks
 * again before calling Cloudinary. The MIME allow-list is a list rather than a
 * `image/*` wildcard because "starts with image/" happily admits SVG, which is
 * a document format that can carry script and is a stored-XSS vector when
 * served back from your own domain.
 */
const MEDIA = Object.freeze({
  MAX_BYTES: 3 * 1024 * 1024, // 3 MB
  MAX_FILES_PER_REQUEST: 1,
  ALLOWED_MIME_TYPES: Object.freeze([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
  ]),
});

const MEDIA_TYPE = Object.freeze({
  IMAGE: "IMAGE",
});

const MEDIA_TYPE_VALUES = Object.freeze(Object.values(MEDIA_TYPE));

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

/**
 * How long a password-reset link stays usable. Same reasoning as the
 * verification link, and arguably tighter: this token can take over an
 * existing account with orders and saved details behind it.
 */
const PASSWORD_RESET_TTL_MINUTES = 10;

module.exports = {
  ROLES,
  ROLE_VALUES,
  ROLE_RANK,
  roleRank,
  roleAtLeast,
  assignableRoles,
  PAGINATION,
  BRAND,
  USER_STATUS,
  USER_STATUS_VALUES,
  SIGN_IN_ALLOWED_STATUSES,
  AUTH_PROVIDERS,
  AUTH_PROVIDER_VALUES,
  SOCIAL_PROVIDERS,
  MEDIA,
  MEDIA_TYPE,
  MEDIA_TYPE_VALUES,
  REFRESH_COOKIE_NAME,
  EMAIL_VERIFICATION_TTL_MINUTES,
  PASSWORD_RESET_TTL_MINUTES,
};
