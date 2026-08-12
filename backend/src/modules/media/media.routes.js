"use strict";

const express = require("express");
const controller = require("./media.controller");
const schemas = require("./media.validation");
const validate = require("../../middleware/validate");
const { authenticate } = require("../../middleware/authenticate");
const { authorize } = require("../../middleware/authorize");
const { uploadSingle } = require("../../middleware/upload");
const { readLimiter, writeLimiter } = require("../../middleware/rateLimiter");
const { ROLES } = require("../../shared/constants");

const router = express.Router();

// Every media route requires a signed-in caller.
router.use(authenticate);

/**
 * Upload one file on the `file` field, as `multipart/form-data`.
 *
 * Middleware order is load-bearing here. `uploadSingle` has to run before
 * `validate`, because until multer has parsed the multipart body there is no
 * `req.body` for the schema to read - and it also enforces the 3MB cap while
 * streaming, so an oversized request is rejected without being buffered.
 *
 * Open to any authenticated role: a customer needs this for their own profile
 * picture. Deleting and listing everything are the privileged operations.
 */
router.post(
  "/upload",
  writeLimiter,
  uploadSingle("file"),
  validate(schemas.upload),
  controller.upload
);

/**
 * The caller's own uploads. Any authenticated role, because it can only ever
 * return their own rows.
 */
router.post("/my", readLimiter, validate(schemas.myMedia), controller.myMedia);

/* --------------------------------- Staff --------------------------------- */

/**
 * Every upload from every user. `authorize(ROLES.ADMIN)` means admin **and
 * above**, so owners are included without being named separately.
 */
router.post(
  "/filter",
  readLimiter,
  authorize(ROLES.ADMIN),
  validate(schemas.filterMedia),
  controller.filterMedia
);

router.delete(
  "/:id",
  writeLimiter,
  authorize(ROLES.ADMIN),
  validate(schemas.mediaById),
  controller.remove
);

module.exports = router;
