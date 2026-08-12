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

/* --------------------------------- Staff --------------------------------- */

// Moderators and above may browse the user list; only admins and above can
// change anything on it.
router.get(
  "/",
  readLimiter,
  authorize(ROLES.MODERATOR),
  validate(schemas.listUsers),
  controller.listUsers
);

// Declared after `/me` so the literal path is matched before this parameter
// route can swallow it.
router.get(
  "/:id",
  readLimiter,
  validate(schemas.getUser),
  authorizeSelfOrAbove((req) => req.params.id),
  controller.getUser
);

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

module.exports = router;
