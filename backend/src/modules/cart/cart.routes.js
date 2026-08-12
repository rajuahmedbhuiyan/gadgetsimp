"use strict";

const express = require("express");
const controller = require("./cart.controller");
const schemas = require("./cart.validation");
const validate = require("../../middleware/validate");
const { authenticate } = require("../../middleware/authenticate");
const { readLimiter, writeLimiter } = require("../../middleware/rateLimiter");

const router = express.Router();

/**
 * The cart is private, always.
 *
 * `authenticate` on the router rather than per route, so a route added later
 * cannot be forgotten - the failure mode of the alternative is one endpoint
 * serving another person's basket.
 *
 * No `authorize` anywhere below: every signed-in role shops. A cart is the one
 * part of the API where an owner and a brand-new customer have identical
 * rights, and each can only ever reach their own, because the user id comes
 * from the verified token and appears in no request body.
 */
router.use(authenticate);

router.get("/", readLimiter, controller.getCart);

/**
 * The header badge. Split out because it runs on every page load of the site
 * and has no business pricing lines or checking stock to answer "3".
 */
router.get("/count", readLimiter, controller.count);

router.post("/items", writeLimiter, validate(schemas.addItems), controller.addItems);

router.patch("/items", writeLimiter, validate(schemas.updateItems), controller.updateItems);

/**
 * Batch remove, and the one route that reads a body from a DELETE.
 *
 * The alternative - a `POST /cart/items/remove` - invents a verb to work
 * around a method that already means exactly this, and repeated `DELETE
 * /cart/items/{id}` calls turn one user action into N requests that can half
 * succeed. Node, Express and `fetch` all handle a DELETE body; the client-side
 * catch is axios, which needs `{ data: { itemIds } }` rather than a plain
 * second argument. That is documented on the operation.
 */
router.delete("/items", writeLimiter, validate(schemas.removeItems), controller.removeItems);

// Declared after `/items` so the two cannot be confused when reading the file,
// though Express matches on the full path and would not conflate them anyway.
router.delete("/", writeLimiter, controller.clear);

module.exports = router;
