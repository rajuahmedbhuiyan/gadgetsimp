"use strict";

const express = require("express");
const controller = require("./shop.controller");
const schemas = require("./shop.validation");
const validate = require("../../middleware/validate");
const { optionalAuthenticate } = require("../../middleware/authenticate");
const { readLimiter, searchLimiter } = require("../../middleware/rateLimiter");

const router = express.Router();

/**
 * The public storefront. No authentication - a shopper browsing a catalog is
 * not signed in.
 *
 * `optionalAuthenticate` attaches the user when a token happens to be present,
 * which is what lets a signed-in shopper be rate limited by user id instead of
 * sharing an IP bucket with everyone behind the same NAT. It never rejects.
 *
 * Visibility is enforced in the query itself, not by the missing auth: only
 * ACTIVE, PUBLIC, published products are ever returned, so these routes cannot
 * leak drafts even though anyone may call them.
 */
router.use(optionalAuthenticate);

/**
 * Listing carries the search tier too, but only when a term is present -
 * `$text` search is the most expensive read in the catalog, while plain
 * browsing is cheap and should not be metered as though it were.
 */
const searchAwareLimiter = (req, res, next) =>
  req.body?.search ? searchLimiter(req, res, next) : next();

router.post(
  "/",
  readLimiter,
  searchAwareLimiter,
  validate(schemas.shopFilter),
  controller.list
);

/**
 * A GET, and cacheable: a category's sidebar is identical for every shopper
 * and changes only when the catalog does.
 *
 * Two path segments, so it cannot be shadowed by the single-segment
 * `/:slug` below - but it is declared first anyway, because relying on
 * segment counts is the kind of thing that breaks when a route is edited.
 */
router.post(
  "/categories",
  readLimiter,
  validate(schemas.shopCategories),
  controller.listCategories
);

router.get(
  "/filter-options/:categorySlug",
  readLimiter,
  validate(schemas.shopFilterOptions),
  controller.filterOptions
);

router.get("/:slug", readLimiter, validate(schemas.productBySlug), controller.getBySlug);

module.exports = router;
