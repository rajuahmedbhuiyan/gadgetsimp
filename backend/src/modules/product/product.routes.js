"use strict";

const express = require("express");
const controller = require("./product.controller");
const schemas = require("./product.validation");
const validate = require("../../middleware/validate");
const { authenticate, optionalAuthenticate } = require("../../middleware/authenticate");
const { authorize } = require("../../middleware/authorize");
const { readLimiter, searchLimiter, writeLimiter } = require("../../middleware/rateLimiter");
const { ROLES } = require("../../shared/constants");

const router = express.Router();

/* --------------------------------- Public -------------------------------- */

/**
 * Listing carries two limiters. A plain browse is cheap and gets the generous
 * read budget; a request with `?search=` also hits a Mongo `$text` index, so
 * `searchLimiter` skips itself unless a search term is actually present.
 * Chaining them this way keeps expensive traffic metered without punishing
 * ordinary catalog browsing.
 */
const searchAwareLimiter = (req, res, next) =>
  req.query.search ? searchLimiter(req, res, next) : next();

router.get(
  "/",
  optionalAuthenticate,
  readLimiter,
  searchAwareLimiter,
  validate(schemas.listProducts),
  controller.list
);

router.get(
  "/:slug",
  optionalAuthenticate,
  readLimiter,
  validate(schemas.productBySlug),
  controller.getBySlug
);

/* --------------------------------- Admin --------------------------------- */

router.post(
  "/",
  authenticate,
  authorize(ROLES.ADMIN),
  writeLimiter,
  validate(schemas.createProduct),
  controller.create
);

router.patch(
  "/:id",
  authenticate,
  authorize(ROLES.ADMIN),
  writeLimiter,
  validate(schemas.updateProduct),
  controller.update
);

router.delete(
  "/:id",
  authenticate,
  authorize(ROLES.ADMIN),
  writeLimiter,
  validate(schemas.productById),
  controller.remove
);

router.post(
  "/:id/stock",
  authenticate,
  authorize(ROLES.ADMIN),
  writeLimiter,
  validate(schemas.adjustStock),
  controller.adjustStock
);

module.exports = router;
