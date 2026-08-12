"use strict";

const express = require("express");
const controller = require("./order.controller");
const schemas = require("./order.validation");
const validate = require("../../middleware/validate");
const { authenticate, optionalAuthenticate } = require("../../middleware/authenticate");
const { readLimiter, writeLimiter } = require("../../middleware/rateLimiter");

const router = express.Router();

/**
 * Customer-facing orders.
 *
 * Note the split: placing an order uses `optionalAuthenticate`, everything
 * else uses `authenticate`. A shopper must be able to buy without an account -
 * that is what guest checkout is - but reading an order list requires knowing
 * whose list it is, and there is no way to answer that for an anonymous
 * caller.
 */

/**
 * Guest checkout. `optionalAuthenticate` attaches the user when a token
 * happens to be present and never rejects, so one handler serves both cases
 * and a signed-in order is linked to its account automatically.
 *
 * Write tier: this is the most expensive endpoint in the application - it
 * prices a basket, reserves stock and may send mail - and it is the one worth
 * flooding, since every accepted request creates a cash-on-delivery order that
 * somebody has to cancel by hand.
 */
router.post(
  "/",
  writeLimiter,
  optionalAuthenticate,
  validate(schemas.placeOrder),
  controller.placeOrder
);

/**
 * From here down, a session is required.
 *
 * POST for the listing, matching every other filter endpoint in this API: the
 * filter set is open-ended and a GET would need bracket syntax in the query
 * string that every client has to agree on.
 */
router.post("/filter", readLimiter, authenticate, validate(schemas.myOrders), controller.myOrders);

router.get(
  "/:id",
  readLimiter,
  authenticate,
  validate(schemas.orderById),
  controller.myOrderById
);

module.exports = router;
