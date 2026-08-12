"use strict";

const express = require("express");
const controller = require("./brand.controller");
const schemas = require("./brand.validation");
const validate = require("../../middleware/validate");
const { authenticate } = require("../../middleware/authenticate");
const { authorize } = require("../../middleware/authorize");
const { readLimiter, writeLimiter } = require("../../middleware/rateLimiter");
const { ROLES } = require("../../shared/constants");

const router = express.Router();
router.post("/filter", readLimiter, validate(schemas.listBrands), controller.list);
router.post("/", writeLimiter, authenticate, authorize(ROLES.ADMIN), validate(schemas.createBrand), controller.create);
router.get("/:id", readLimiter, validate(schemas.brandById), controller.getById);
router.put("/:id", writeLimiter, authenticate, authorize(ROLES.ADMIN), validate(schemas.updateBrand), controller.update);
router.delete("/:id", writeLimiter, authenticate, authorize(ROLES.ADMIN), validate(schemas.brandById), controller.remove);

module.exports = router;
