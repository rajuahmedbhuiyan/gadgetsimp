"use strict";

const express = require("express");
const controller = require("./category.controller");
const schemas = require("./category.validation");
const validate = require("../../middleware/validate");
const { authenticate } = require("../../middleware/authenticate");
const { authorize } = require("../../middleware/authorize");
const { readLimiter, writeLimiter } = require("../../middleware/rateLimiter");
const { ROLES } = require("../../shared/constants");

const router = express.Router();

router.post("/filter", readLimiter, validate(schemas.listCategories), controller.list);
router.post(
  "/filter-groupped",
  readLimiter,
  validate(schemas.filterGroupedCategories),
  controller.filterGrouped
);
router.put(
  "/sort",
  writeLimiter,
  authenticate,
  authorize(ROLES.ADMIN),
  validate(schemas.sortCategories),
  controller.sort
);
router.post("/", writeLimiter, authenticate, authorize(ROLES.ADMIN), validate(schemas.createCategory), controller.create);
router.get("/:id/configuration", readLimiter, validate(schemas.categoryById), controller.configuration);
router.get("/:id", readLimiter, validate(schemas.categoryById), controller.getById);
router.put("/:id", writeLimiter, authenticate, authorize(ROLES.ADMIN), validate(schemas.updateCategory), controller.update);
router.delete("/:id", writeLimiter, authenticate, authorize(ROLES.ADMIN), validate(schemas.categoryById), controller.remove);

module.exports = router;
