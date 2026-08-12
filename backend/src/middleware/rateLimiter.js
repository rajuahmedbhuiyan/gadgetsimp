"use strict";

const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const env = require("../config/env");
const logger = require("../config/logger");
const { getRedisClient } = require("../config/redis");
const ApiError = require("../shared/ApiError");

/**
 * Tiered rate limiting.
 *
 * One global limit is close to useless: set it high enough for catalog
 * browsing and it will never stop a password-guessing run; set it low enough
 * to stop the attack and you break a shopper scrolling a product grid. So
 * routes are grouped by what abuse of them actually costs, and each group
 * gets its own budget and its own counter namespace.
 *
 * Two further decisions worth stating:
 *
 * 1. Identity over IP. A signed-in caller is limited by user id, so shoppers
 *    behind one office NAT or mobile carrier CGNAT are not billed to a shared
 *    IP bucket. Anonymous callers fall back to IP, normalised through
 *    `ipKeyGenerator` so an IPv6 client cannot simply hop to another address
 *    in its own /56 to reset the counter.
 *
 * 2. Failures are what count on auth routes. `skipSuccessfulRequests` means a
 *    shopper who logs in correctly ten times is untouched, while ten wrong
 *    passwords burn the budget.
 */

/**
 * Each limiter gets its own Redis key prefix. Without this the tiers share
 * one counter and the strict auth budget would be drained by catalog traffic.
 */
function buildStore(name) {
  const client = getRedisClient();
  if (!client) return undefined; // express-rate-limit falls back to MemoryStore

  return new RedisStore({
    sendCommand: (...args) => client.call(...args),
    prefix: `rl:${name}:`,
  });
}

/**
 * Resolves who is being limited. `req.user` is populated by `authenticate`,
 * so this is identity-aware on protected routes and IP-based elsewhere.
 */
function identityKey(req) {
  if (req.user?.id) return `u:${req.user.id}`;
  return `ip:${ipKeyGenerator(req.ip ?? "")}`;
}

function createRateLimiter({
  name,
  windowMs,
  limit,
  message = "Too many requests. Please slow down and try again later.",
  keyGenerator = identityKey,
  skipSuccessfulRequests = false,
  skipFailedRequests = false,
}) {
  return rateLimit({
    windowMs,
    limit,
    // draft-8 emits the RFC-track combined `RateLimit` header. Clients that
    // read these can back off before they are ever rejected.
    standardHeaders: "draft-8",
    legacyHeaders: false,
    identifier: name,
    store: buildStore(name),
    keyGenerator,
    skipSuccessfulRequests,
    skipFailedRequests,

    // Turning the limiter off wholesale is for tests only; leaving it on in
    // development is what surfaces a mis-tuned budget before production does.
    skip: () => !env.RATE_LIMIT_ENABLED,

    // Route the rejection through ApiError so a 429 comes back in the same
    // envelope as every other error rather than as plain text.
    handler: (req, res, next, options) => {
      const retryAfterSeconds = Math.ceil(options.windowMs / 1000);

      logger.warn(
        { limiter: name, key: keyGenerator(req, res), path: req.originalUrl, ip: req.ip },
        "Rate limit exceeded"
      );

      res.setHeader("Retry-After", retryAfterSeconds);

      next(
        ApiError.tooManyRequests(message, {
          code: "RATE_LIMIT_EXCEEDED",
          errors: [{ field: "request", message: `Retry after ${retryAfterSeconds} seconds.` }],
        })
      );
    },
  });
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Blanket backstop mounted on the whole API. Deliberately generous - it is
 * there to stop a runaway script, not to shape normal traffic.
 */
const globalLimiter = createRateLimiter({
  name: "global",
  windowMs: 15 * MINUTE,
  limit: 900,
});

/**
 * Catalog reads. Browsing a storefront is bursty by nature: one product page
 * can fan out into several requests, so this sits well above human pace.
 */
const readLimiter = createRateLimiter({
  name: "read",
  windowMs: 1 * MINUTE,
  limit: 120,
});

/**
 * Text search hits a Mongo `$text` index and is the most expensive read in
 * the catalog, so it is metered separately from ordinary reads.
 */
const searchLimiter = createRateLimiter({
  name: "search",
  windowMs: 1 * MINUTE,
  limit: 30,
  message: "Too many searches. Please wait a moment before searching again.",
});

/**
 * Admin and customer mutations. Writes cost index maintenance and are far
 * rarer than reads in a healthy traffic mix.
 */
const writeLimiter = createRateLimiter({
  name: "write",
  windowMs: 1 * MINUTE,
  limit: 40,
});

/**
 * Login and refresh. Keyed by IP *and* the submitted email, which covers both
 * shapes of credential attack: one account hammered from many IPs, and many
 * accounts sprayed from one IP. Only failures count.
 */
const authLimiter = createRateLimiter({
  name: "auth",
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Too many failed attempts. Please try again in 15 minutes.",
  keyGenerator: (req) => {
    const email = String(req.body?.email ?? "").toLowerCase().trim();
    return `ip:${ipKeyGenerator(req.ip ?? "")}|email:${email}`;
  },
});

/**
 * Registration. Per-IP only - there is no account to key on yet, and the
 * abuse being prevented is bulk fake-account creation.
 */
const registerLimiter = createRateLimiter({
  name: "register",
  windowMs: 1 * HOUR,
  limit: 5,
  message: "Too many accounts created from this network. Please try again later.",
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "")}`,
});

/**
 * Anything that sends an email or rotates a credential. Tight on purpose:
 * these endpoints are the ones abused to spam a third party's inbox.
 */
const sensitiveLimiter = createRateLimiter({
  name: "sensitive",
  windowMs: 1 * HOUR,
  limit: 5,
  message: "Too many attempts on a sensitive action. Please try again later.",
});

module.exports = {
  createRateLimiter,
  globalLimiter,
  readLimiter,
  searchLimiter,
  writeLimiter,
  authLimiter,
  registerLimiter,
  sensitiveLimiter,
};
