"use strict";

const express = require("express");
const controller = require("./category.controller");
const schemas = require("./category.validation");
const validate = require("../../middleware/validate");
const { authenticate, optionalAuthenticate } = require("../../middleware/authenticate");
const { authorize } = require("../../middleware/authorize");
const { readLimiter, writeLimiter } = require("../../middleware/rateLimiter");
const { ROLES } = require("../../shared/constants");

const router = express.Router();

/* --------------------------------- Public -------------------------------- */

// `optionalAuthenticate` is what lets a signed-in shopper be rate limited by
// user id rather than sharing an IP bucket with everyone behind the same NAT.
router.get(
  "/",
  optionalAuthenticate,
  readLimiter,
  validate(schemas.listCategories),
  controller.list
);

router.get(
  "/:slug",
  optionalAuthenticate,
  readLimiter,
  validate(schemas.categoryBySlug),
  controller.getBySlug
);

/* --------------------------------- Admin --------------------------------- */

router.post(
  "/",
  authenticate,
  authorize(ROLES.ADMIN),
  writeLimiter,
  validate(schemas.createCategory),
  controller.create
);

router.patch(
  "/:id",
  authenticate,
  authorize(ROLES.ADMIN),
  writeLimiter,
  validate(schemas.updateCategory),
  controller.update
);

router.delete(
  "/:id",
  authenticate,
  authorize(ROLES.ADMIN),
  writeLimiter,
  validate(schemas.categoryById),
  controller.remove
);

module.exports = router;
