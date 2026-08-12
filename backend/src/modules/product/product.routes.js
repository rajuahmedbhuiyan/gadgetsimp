"use strict";

const express = require("express");
const controller = require("./product.controller");
const schemas = require("./product.validation");
const validate = require("../../middleware/validate");
const { authenticate } = require("../../middleware/authenticate");
const { authorize } = require("../../middleware/authorize");
const { readLimiter, writeLimiter } = require("../../middleware/rateLimiter");
const { ROLES } = require("../../shared/constants");

const router = express.Router();

router.use(authenticate, authorize(ROLES.MODERATOR));
router.post("/filter", readLimiter, validate(schemas.listProducts), controller.list);
router.post("/", writeLimiter, validate(schemas.createProduct), controller.create);
router.get("/:id", readLimiter, validate(schemas.productById), controller.getById);
router.put("/:id", writeLimiter, validate(schemas.updateProduct), controller.update);
router.delete("/:id", writeLimiter, validate(schemas.productById), controller.remove);

module.exports = router;
