"use strict";

const express = require("express");
const controller = require("./product-public.controller");
const productSchemas = require("../product/product.validation");
const validate = require("../../middleware/validate");
const { readLimiter } = require("../../middleware/rateLimiter");

const router = express.Router();

router.post("/filter-options", readLimiter, validate(productSchemas.productFilters), controller.filterOptions);

module.exports = router;
