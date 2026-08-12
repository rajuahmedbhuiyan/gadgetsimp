"use strict";

const express = require("express");
const controller = require("./attribute.controller");
const schemas = require("./attribute.validation");
const validate = require("../../middleware/validate");
const { authenticate } = require("../../middleware/authenticate");
const { authorize } = require("../../middleware/authorize");
const { readLimiter, writeLimiter } = require("../../middleware/rateLimiter");
const { ROLES } = require("../../shared/constants");

const router = express.Router();
router.use(authenticate, authorize(ROLES.ADMIN));

router.post("/filter", readLimiter, validate(schemas.listAttributes), controller.list);
router.post("/", writeLimiter, validate(schemas.createAttribute), controller.create);
router.get("/:id", readLimiter, validate(schemas.attributeById), controller.getById);
router.put("/:id", writeLimiter, validate(schemas.updateAttribute), controller.update);
router.delete("/:id", writeLimiter, validate(schemas.attributeById), controller.remove);

module.exports = router;
