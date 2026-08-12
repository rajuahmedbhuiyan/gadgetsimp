"use strict";

const express = require("express");
const controller = require("./auth.controller");
const schemas = require("./auth.validation");
const validate = require("../../middleware/validate");
const { authenticate } = require("../../middleware/authenticate");
const {
  authLimiter,
  registerLimiter,
  sensitiveLimiter,
  readLimiter,
} = require("../../middleware/rateLimiter");

const router = express.Router();

/**
 * Middleware order on every route is deliberate and always the same:
 *
 *   rate limit  ->  validate  ->  authenticate  ->  authorize  ->  controller
 *
 * The limiter runs first so a flood is rejected before it costs a schema
 * parse or a database round trip - a limiter placed after authentication
 * would still let an attacker drive bcrypt comparisons at full speed.
 * Validation runs before authentication so the auth limiter's key generator
 * sees a normalised, lowercased email.
 */

/* ------------------------------ Signup flow ------------------------------ */

// Step 1: record the signup and email a link. Creates no account.
router.post("/register", registerLimiter, validate(schemas.register), controller.register);

// Step 2: exchange the emailed token for a real account plus a session.
// Rate limited on the auth tier because the token is a credential, and
// unlimited attempts would let it be brute-forced.
router.post("/verify-email", authLimiter, validate(schemas.verifyEmail), controller.verifyEmail);

// Sends mail to an address the caller names, so it gets the strictest tier -
// this is the endpoint someone would abuse to spam a third party's inbox.
router.post(
  "/resend-verification",
  sensitiveLimiter,
  validate(schemas.resendVerification),
  controller.resendVerification
);

/* ----------------------------- Social sign-in ---------------------------- */

/**
 * One endpoint for every provider, discriminated by `type`. Signs up and
 * signs in through the same call.
 *
 * Uses the auth tier because each request costs outbound work against the
 * provider - two Graph calls for Facebook, a JWKS fetch for Google. Unmetered,
 * it would let someone burn the provider's rate limit as well as ours. Keyed
 * on IP, since there is no email in the body to key on.
 */
router.post(
  "/social-login",
  authLimiter,
  validate(schemas.socialLogin),
  controller.socialLogin
);

// Lets the frontend render only the buttons that will work here.
router.get("/providers", readLimiter, controller.listProviders);

/* ------------------------------- Sessions -------------------------------- */

router.post("/login", authLimiter, validate(schemas.login), controller.login);

// No `validate` - the refresh token arrives as a cookie, not a body.
router.post("/refresh", authLimiter, controller.refresh);

router.post("/logout", authenticate, controller.logout);

router.post("/logout-all", authenticate, controller.logoutAll);

router.post(
  "/change-password",
  sensitiveLimiter,
  authenticate,
  validate(schemas.changePassword),
  controller.changePassword
);

router.get("/me", authenticate, controller.me);

module.exports = router;
