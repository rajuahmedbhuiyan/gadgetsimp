"use strict";

const express = require("express");
const controller = require("./product.controller");
const schemas = require("./product.validation");
const validate = require("../../middleware/validate");
const { authenticate } = require("../../middleware/authenticate");
const { authorize } = require("../../middleware/authorize");
const { readLimiter, writeLimiter } = require("../../middleware/rateLimiter");
const { ROLES } = require("../../shared/constants");

const router = express.Router();

router.use(authenticate, authorize(ROLES.MODERATOR));
router.post("/filter", readLimiter, validate(schemas.listProducts), controller.list);
router.post("/", writeLimiter, validate(schemas.createProduct), controller.create);
router.get("/:id", readLimiter, validate(schemas.productById), controller.getById);
router.put("/:id", writeLimiter, validate(schemas.updateProduct), controller.update);

/**
 * Section patches, one per panel of the admin product form.
 *
 * `PUT /:id` replaces the whole document, so saving one panel means sending
 * every field - and any field the form did not load comes back as a silent
 * reset. These let each panel save only what it owns.
 *
 * Declared before `/:id` variants that could shadow them is not a concern here
 * (the suffixes are literal), but they stay grouped so the surface is obvious.
 */
router.patch("/:id/general", writeLimiter, validate(schemas.patchGeneral), controller.patchGeneral);
router.patch("/:id/description", writeLimiter, validate(schemas.patchDescription), controller.patchDescription);
router.patch("/:id/pricing", writeLimiter, validate(schemas.patchPricing), controller.patchPricing);
router.patch("/:id/stock", writeLimiter, validate(schemas.patchStock), controller.patchStock);
router.patch("/:id/attributes", writeLimiter, validate(schemas.patchAttributes), controller.patchAttributes);
router.patch("/:id/media", writeLimiter, validate(schemas.patchMedia), controller.patchMedia);
router.patch("/:id/seo", writeLimiter, validate(schemas.patchSeo), controller.patchSeo);

// One-decision toggles, for list-view quick actions.
router.patch("/:id/featured", writeLimiter, validate(schemas.patchFeatured), controller.patchFeatured);
router.patch("/:id/status", writeLimiter, validate(schemas.patchStatus), controller.patchStatus);

router.delete("/:id", writeLimiter, validate(schemas.productById), controller.remove);

module.exports = router;
