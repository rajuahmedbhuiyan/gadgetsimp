"use strict";

const express = require("express");
const controller = require("./dashboard.controller");
const schemas = require("./dashboard.validation");
const validate = require("../../middleware/validate");
const { authenticate } = require("../../middleware/authenticate");
const { authorize } = require("../../middleware/authorize");
const { readLimiter } = require("../../middleware/rateLimiter");
const { ROLES } = require("../../shared/constants");

const router = express.Router();

router.use(authenticate, authorize(ROLES.MODERATOR));

router.get("/", readLimiter, validate(schemas.overview), controller.overview);

module.exports = router;
