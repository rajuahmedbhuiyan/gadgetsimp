"use strict";

const express = require("express");
const controller = require("./wishlist.controller");
const schemas = require("./wishlist.validation");
const validate = require("../../middleware/validate");
const { authenticate } = require("../../middleware/authenticate");
const { readLimiter, writeLimiter } = require("../../middleware/rateLimiter");

const router = express.Router();

/**
 * A wishlist is private, always.
 *
 * `authenticate` on the router rather than per route, so a route added later
 * inherits the gate instead of relying on someone remembering it. No
 * `authorize` anywhere: every signed-in role saves products, and each can only
 * ever reach their own list because the user id comes from the token and
 * appears in no request body.
 */
router.use(authenticate);

/**
 * The listing, with live product data. POST for the same reason every other
 * filter endpoint here is: the filter set is open-ended and a GET would need
 * bracket syntax in the query string that every client has to agree on.
 */
router.post("/filter", readLimiter, validate(schemas.filterItems), controller.filterItems);

/**
 * Just the ids.
 *
 * A GET, and its own endpoint, because a storefront grid needs to fill in a
 * hundred heart icons on load. Asking the listing for that would ship a
 * hundred product cards to render a hundred booleans.
 */
router.get("/ids", readLimiter, controller.listIds);

router.post("/items", writeLimiter, validate(schemas.addItems), controller.addItems);

/**
 * Batch remove. A DELETE carrying a JSON body, like the cart's - `fetch`
 * handles it natively; axios needs `{ data: { productIds } }`.
 */
router.delete("/items", writeLimiter, validate(schemas.removeItems), controller.removeItems);

/**
 * The heart icon. Declared after `/items` for readability, though Express
 * matches on the full path and would not conflate them.
 */
router.post("/toggle", writeLimiter, validate(schemas.toggleItem), controller.toggle);

router.delete("/", writeLimiter, controller.clear);

module.exports = router;
