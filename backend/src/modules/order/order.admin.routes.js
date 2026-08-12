"use strict";

const express = require("express");
const controller = require("./order.admin.controller");
const schemas = require("./order.validation");
const validate = require("../../middleware/validate");
const { authenticate } = require("../../middleware/authenticate");
const { authorize } = require("../../middleware/authorize");
const { readLimiter, writeLimiter, sensitiveLimiter } = require("../../middleware/rateLimiter");
const { ROLES } = require("../../shared/constants");

const router = express.Router();

/**
 * Staff order management, mounted separately from the customer routes.
 *
 * `authenticate` then `authorize(ROLES.MODERATOR)` on the router, so a route
 * added later inherits the gate instead of relying on someone remembering it -
 * and the failure mode of forgetting here is every order in the system served
 * to anyone with a login.
 *
 * `authorize` takes the **minimum** role, so MODERATOR admits moderators,
 * admins and owners. The two destructive routes at the bottom raise that bar
 * to ADMIN individually.
 */
router.use(authenticate, authorize(ROLES.MODERATOR));

/* ------------------------------- Moderator ------------------------------- */

router.post("/filter", readLimiter, validate(schemas.filterOrders), controller.filterOrders);

router.get("/:id", readLimiter, validate(schemas.orderById), controller.getOrder);

/**
 * Move an order through the workflow. A note is required for RETURNED and
 * CANCELED - enforced in the service, which also refuses illegal transitions.
 */
router.patch(
  "/:id/status",
  writeLimiter,
  validate(schemas.changeStatus),
  controller.changeStatus
);

/**
 * Correct the delivery details - name, phone, address, note. Nothing about
 * money or state is reachable from here; that is the point of it being a
 * separate endpoint from the status change.
 */
router.patch(
  "/:id",
  writeLimiter,
  validate(schemas.updateOrderDetails),
  controller.updateDetails
);

/* ------------------------------ Admin and up ------------------------------ */

/**
 * Deletion is admin-only, one rung above the rest of this router. A moderator
 * works the queue; removing the financial record of a sale is a different kind
 * of act.
 */
router.delete(
  "/:id",
  writeLimiter,
  authorize(ROLES.ADMIN),
  validate(schemas.orderById),
  controller.softDelete
);

/**
 * Irreversible, and therefore its own path rather than a flag on the route
 * above: a destructive operation should be something you ask for by name, not
 * something a stray query parameter turns on. Sensitive tier.
 */
router.delete(
  "/:id/permanent",
  sensitiveLimiter,
  authorize(ROLES.ADMIN),
  validate(schemas.orderById),
  controller.hardDelete
);

module.exports = router;
