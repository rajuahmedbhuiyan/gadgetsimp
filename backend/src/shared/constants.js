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

/* ------------------------------- Catalog -------------------------------- */

const CATALOG_STATUS = Object.freeze({
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
});

const CATALOG_STATUS_VALUES = Object.freeze(Object.values(CATALOG_STATUS));

const VISIBILITY = Object.freeze({
  PUBLIC: "PUBLIC",
  PRIVATE: "PRIVATE",
  HIDDEN: "HIDDEN",
});

const VISIBILITY_VALUES = Object.freeze(Object.values(VISIBILITY));

const PRODUCT_STATUS = Object.freeze({
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  OUT_OF_STOCK: "OUT_OF_STOCK",
});
const PRODUCT_STATUS_VALUES = Object.freeze(Object.values(PRODUCT_STATUS));

const PRODUCT_VISIBILITY = Object.freeze({ PUBLIC: "PUBLIC", HIDDEN: "HIDDEN" });
const PRODUCT_VISIBILITY_VALUES = Object.freeze(Object.values(PRODUCT_VISIBILITY));

// These values intentionally match the public contract in the catalog spec.
const ATTRIBUTE_SOURCE = Object.freeze({
  PRODUCT: "product",
  VARIANT: "variant",
  ENTITY: "entity",
});

const ATTRIBUTE_SOURCE_VALUES = Object.freeze(Object.values(ATTRIBUTE_SOURCE));

const ATTRIBUTE_TYPE = Object.freeze({
  CHECKBOX: "checkbox",
  RADIO: "radio",
  SELECT: "select",
  COLOR: "color",
  RANGE: "range",
});

const ATTRIBUTE_TYPE_VALUES = Object.freeze(Object.values(ATTRIBUTE_TYPE));

const PRODUCT_TYPE = Object.freeze({
  SIMPLE: "SIMPLE",
  VARIABLE: "VARIABLE",
});

const PRODUCT_TYPE_VALUES = Object.freeze(Object.values(PRODUCT_TYPE));

const STOCK_STATUS = Object.freeze({
  IN_STOCK: "IN_STOCK",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  BACKORDER: "BACKORDER",
});

const STOCK_STATUS_VALUES = Object.freeze(Object.values(STOCK_STATUS));

const CURRENCY_VALUES = Object.freeze(["BDT", "USD", "EUR", "GBP"]);

/* --------------------------------- Cart ---------------------------------- */

/**
 * Cart limits.
 *
 * A cart is user-controlled, unbounded storage attached to an account, so it
 * needs ceilings in three independent places: how much of one thing you may
 * hold, how many distinct things, and how much one request may change. Without
 * the third, a single call could add ten thousand lines and the first two caps
 * would never be consulted.
 *
 * `MAX_QUANTITY_PER_LINE` is a sanity bound, not a stock rule - real stock is
 * checked per item against the product or variant and is almost always the
 * lower of the two.
 */
const CART = Object.freeze({
  MAX_LINES: 100,
  MAX_QUANTITY_PER_LINE: 100,
  MAX_BATCH_SIZE: 50,
});

/**
 * Why a cart line is not simply buyable.
 *
 * These are **advisory** and travel on the line itself rather than failing the
 * read: a cart whose product was unpublished last night must still load, or
 * the shopper is locked out of their own basket with no way to remove the
 * offending row. The checkout is where they become blocking.
 *
 * `QUANTITY_ADJUSTED` and `PRICE_CHANGED` are the two the UI should surface
 * loudly - both mean the shopper is looking at something other than what they
 * chose, and both are silent data loss if the client ignores them.
 */
const CART_ISSUE = Object.freeze({
  PRODUCT_UNAVAILABLE: "PRODUCT_UNAVAILABLE",
  VARIANT_UNAVAILABLE: "VARIANT_UNAVAILABLE",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  // Distinct from OUT_OF_STOCK: some remain, just fewer than are being held.
  // The fix is a smaller number, not removal, and the message should say so.
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  QUANTITY_ADJUSTED: "QUANTITY_ADJUSTED",
  PRICE_CHANGED: "PRICE_CHANGED",
});

const CART_ISSUE_VALUES = Object.freeze(Object.values(CART_ISSUE));

/**
 * Wishlist limits.
 *
 * Roomier than the cart, because the two are different things: a cart is what
 * you are buying now and a hundred lines is already unreasonable, while a
 * wishlist is a list you keep - saving two hundred products over a year is
 * ordinary use, not abuse. The cap exists so it stays bounded storage attached
 * to an account, not because anyone should hit it.
 */
const WISHLIST = Object.freeze({
  MAX_ITEMS: 200,
  MAX_BATCH_SIZE: 50,
});

/* -------------------------------- Orders --------------------------------- */

/**
 * The order lifecycle.
 *
 * `CANCELED` is spelled with one L throughout - American spelling, matching
 * the rest of the enums. Enum values reach client code, stored rows and
 * support scripts, so the spelling is permanent either way and being
 * consistent is what matters.
 */
const ORDER_STATUS = Object.freeze({
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  RETURNED: "RETURNED",
  CANCELED: "CANCELED",
});

const ORDER_STATUS_VALUES = Object.freeze(Object.values(ORDER_STATUS));

/**
 * Outcomes that went wrong for the customer, and therefore demand a written
 * reason on the record.
 *
 * The note is not paperwork: a return or a cancellation is the one thing
 * anybody looks back at months later - during a refund dispute, a courier
 * claim, or an argument about who cancelled - and "CANCELED" with no reason
 * answers none of those questions.
 */
const ORDER_NEGATIVE_STATUSES = Object.freeze([
  ORDER_STATUS.RETURNED,
  ORDER_STATUS.CANCELED,
]);

/**
 * Which transitions are legal, as an explicit map rather than a set of
 * scattered `if` statements.
 *
 * Without this, any status could be set to any other, and an order could go
 * from DELIVERED back to PENDING - which is not a workflow, it is a data
 * corruption that only shows up in a report weeks later. `RETURNED` and
 * `CANCELED` are terminal on purpose: an order that ended has ended, and
 * re-opening it would silently re-reserve stock that was already released.
 */
const ORDER_STATUS_FLOW = Object.freeze({
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELED],
  /**
   * A confirmed order can finish without ever being marked out for delivery.
   *
   * The dispatch step is real but it is not always *recorded* - a rider takes
   * a parcel straight out, or the shop hands it over at the counter, and the
   * next thing anyone touches is the outcome. Forcing OUT_FOR_DELIVERY through
   * first does not make that step happen; it makes staff type a status that
   * already passed, which is a worse record than the one with a gap in it.
   *
   * `statusHistory` keeps whichever steps genuinely occurred, so the tracker
   * shows a shorter path rather than an invented one.
   */
  [ORDER_STATUS.CONFIRMED]: [
    ORDER_STATUS.OUT_FOR_DELIVERY,
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.RETURNED,
    ORDER_STATUS.CANCELED,
  ],
  [ORDER_STATUS.OUT_FOR_DELIVERY]: [
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.RETURNED,
    ORDER_STATUS.CANCELED,
  ],
  [ORDER_STATUS.DELIVERED]: [ORDER_STATUS.RETURNED],
  [ORDER_STATUS.RETURNED]: [],
  [ORDER_STATUS.CANCELED]: [],
});

/**
 * Reaching one of these puts the reserved units back on the shelf. Kept
 * alongside the flow so adding a status forces a decision about its stock
 * consequence rather than defaulting to "keep it reserved forever".
 */
const ORDER_STOCK_RELEASING_STATUSES = ORDER_NEGATIVE_STATUSES;

/**
 * Payment methods. One for now, as an enum rather than a boolean because
 * every real store grows a second one, and a `isCashOnDelivery` flag would
 * have to be migrated the day that happens.
 */
const PAYMENT_METHOD = Object.freeze({
  CASH_ON_DELIVERY: "CASH_ON_DELIVERY",
});

const PAYMENT_METHOD_VALUES = Object.freeze(Object.values(PAYMENT_METHOD));

const PAYMENT_STATUS = Object.freeze({
  DUE: "DUE",
  PAID: "PAID",
  REFUNDED: "REFUNDED",
});

const PAYMENT_STATUS_VALUES = Object.freeze(Object.values(PAYMENT_STATUS));

/**
 * Order limits and the customer-facing order number.
 *
 * The number is **random** within its range rather than sequential. A
 * sequential one would be a public counter of how many orders the business
 * has taken - visible to every customer and every competitor who places one
 * order a week and watches it climb.
 *
 * Six digits is 900,000 possibilities, which is comfortable now and will not
 * be forever: collisions are retried against the unique index, but once the
 * store passes roughly 200,000 orders the retry loop starts doing real work
 * and the range should widen. Because the number is guessable by design,
 * nothing may be authorised by knowing it - orders are always fetched by
 * owner or by staff role.
 */
const ORDER = Object.freeze({
  MAX_ITEMS: 50,
  MAX_QUANTITY_PER_ITEM: 100,
  NUMBER_MIN: 100_000,
  NUMBER_MAX: 999_999,
  NUMBER_ATTEMPTS: 8,
  MAX_NOTE_LENGTH: 1000,
});

/**
 * Delivery charges, in the store's currency.
 *
 * Two zones and a threshold, which is how a Bangladeshi courier actually
 * prices: inside Dhaka is a same-city hop, everywhere else goes on a bus.
 * The zone is decided from the shipping address's `district` - falling back
 * to `city`, because `district` is optional at checkout and a customer who
 * only typed "Dhaka" as their city is unambiguously inside the Dhaka zone,
 * and should not be charged the outside rate for skipping an optional field.
 *
 * `FREE_THRESHOLD` is compared against the **subtotal**, not any single
 * line: it is the usual "free delivery over ৳5,000" offer on the order's
 * value, so five items at 1,000 qualify exactly as one item at 5,000 does.
 *
 * These live here rather than in the database because they are a policy the
 * business changes rarely and deliberately. When they need to be editable by
 * staff, this object becomes the fallback for a settings document - and the
 * one rule that must survive that move is that the fee is always decided
 * server-side and never read from a request.
 */
const SHIPPING = Object.freeze({
  INSIDE_DHAKA_FEE: 70,
  OUTSIDE_DHAKA_FEE: 130,
  FREE_THRESHOLD: 5000,
  // Compared lowercased against the trimmed district (or city).
  DHAKA_ZONE: "dhaka",
});

/**
 * How long someone has to choose a password after clicking the verification
 * link that a checkout sent them.
 *
 * Longer than the 10-minute email window on purpose, and safe to be: the
 * emailed link is the part that travels through an untrusted channel and is
 * already spent by this point. What remains is a token held by whoever just
 * clicked, and cutting them off mid-modal for typing slowly would strand a
 * customer who has already paid for something.
 */
const REGISTRATION_COMPLETION_TTL_MINUTES = 30;

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
  CATALOG_STATUS,
  CATALOG_STATUS_VALUES,
  VISIBILITY,
  VISIBILITY_VALUES,
  PRODUCT_STATUS,
  PRODUCT_STATUS_VALUES,
  PRODUCT_VISIBILITY,
  PRODUCT_VISIBILITY_VALUES,
  ATTRIBUTE_SOURCE,
  ATTRIBUTE_SOURCE_VALUES,
  ATTRIBUTE_TYPE,
  ATTRIBUTE_TYPE_VALUES,
  PRODUCT_TYPE,
  PRODUCT_TYPE_VALUES,
  STOCK_STATUS,
  STOCK_STATUS_VALUES,
  CURRENCY_VALUES,
  CART,
  CART_ISSUE,
  CART_ISSUE_VALUES,
  WISHLIST,
  ORDER,
  SHIPPING,
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  ORDER_STATUS_FLOW,
  ORDER_NEGATIVE_STATUSES,
  ORDER_STOCK_RELEASING_STATUSES,
  PAYMENT_METHOD,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS,
  PAYMENT_STATUS_VALUES,
  REGISTRATION_COMPLETION_TTL_MINUTES,
  REFRESH_COOKIE_NAME,
  EMAIL_VERIFICATION_TTL_MINUTES,
  PASSWORD_RESET_TTL_MINUTES,
};
