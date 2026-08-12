"use strict";

const express = require("express");
const controller = require("./variation.controller");
const schemas = require("./variation.validation");
const validate = require("../../middleware/validate");
const { authenticate } = require("../../middleware/authenticate");
const { authorize } = require("../../middleware/authorize");
const { readLimiter, writeLimiter } = require("../../middleware/rateLimiter");
const { ROLES } = require("../../shared/constants");

const router = express.Router();
router.use(authenticate, authorize(ROLES.ADMIN));
router.post("/generate", writeLimiter, validate(schemas.generate), controller.generate);
router.post("/filter", readLimiter, validate(schemas.filter), controller.filter);
router.get("/:id", readLimiter, validate(schemas.byId), controller.getById);
router.patch("/:id", writeLimiter, validate(schemas.patch), controller.patch);
module.exports = router;
