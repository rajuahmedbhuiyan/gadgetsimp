"use strict";

const express = require("express");
const controller = require("./user.controller");
const schemas = require("./user.validation");
const validate = require("../../middleware/validate");
const { authenticate } = require("../../middleware/authenticate");
const { authorize, authorizeSelfOrAbove } = require("../../middleware/authorize");
const { readLimiter, writeLimiter } = require("../../middleware/rateLimiter");
const { ROLES } = require("../../shared/constants");

const router = express.Router();

// Every user route requires a signed-in caller, so authentication is applied
// once here instead of being repeated - and forgotten - on individual routes.
router.use(authenticate);

/* ---------------------------------- Self --------------------------------- */

router.get("/me", readLimiter, controller.getMe);

router.patch("/me", writeLimiter, validate(schemas.updateProfile), controller.updateMe);

/* ------------------------------ Staff: read ------------------------------ */

/**
 * Filtered, paginated listing. `authorize(ROLES.ADMIN)` means admin **and
 * above**, so owners are included without being listed separately.
 *
 * `readLimiter` rather than `writeLimiter` despite being a POST: the tier
 * should reflect what the request costs, and this is a read. Metering it as a
 * write would throttle an admin paging through a table.
 */
router.post(
  "/filter",
  readLimiter,
  authorize(ROLES.ADMIN),
  validate(schemas.filterUsers),
  controller.filterUsers
);

/**
 * Account creation.
 *
 * Sits at `/users/create` rather than `POST /users` because that verb and path
 * are taken by the filter endpoint above. Splitting them by path keeps both
 * explicit; the alternative - one endpoint branching on the body shape - is
 * how you end up creating a user by sending a malformed filter.
 *
 * Owner-only. Creating accounts outright, skipping email verification and
 * choosing the role, is the most privileged write in the API, which is why it
 * does not extend to admins.
 */
router.post(
  "/create",
  writeLimiter,
  authorize(ROLES.OWNER),
  validate(schemas.createUser),
  controller.createUser
);

// Declared after the literal `/me` and `/create` paths so neither is swallowed
// by this parameter route.
router.get(
  "/:id",
  readLimiter,
  validate(schemas.getUser),
  authorizeSelfOrAbove((req) => req.params.id),
  controller.getUser
);

/* ------------------------------ Staff: write ----------------------------- */

router.patch(
  "/:id/role",
  writeLimiter,
  authorize(ROLES.ADMIN),
  validate(schemas.updateRole),
  controller.updateRole
);

router.patch(
  "/:id/status",
  writeLimiter,
  authorize(ROLES.ADMIN),
  validate(schemas.updateStatus),
  controller.updateStatus
);

/* -------------------------------- Deletion ------------------------------- */

/**
 * Soft delete - the routine one. Admin and above, and reversible by setting
 * the status back to ACTIVE.
 */
router.delete(
  "/:id",
  writeLimiter,
  authorize(ROLES.ADMIN),
  validate(schemas.deleteUser),
  controller.softDelete
);

/**
 * Hard delete - owner only, and on its own path rather than a `?force=true`
 * flag on the route above. An irreversible action should be impossible to
 * trigger by fumbling a query parameter.
 */
router.delete(
  "/:id/permanent",
  writeLimiter,
  authorize(ROLES.OWNER),
  validate(schemas.deleteUser),
  controller.hardDelete
);

module.exports = router;
