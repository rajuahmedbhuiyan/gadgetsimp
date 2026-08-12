"use strict";

const productService = require("../product/product.service");
const { sendResponse } = require("../../shared/sendResponse");

async function filterOptions(req, res) {
  const filters = await productService.filters(req.validated.body);
  return sendResponse(res, {
    message: "Product filters retrieved",
    data: { filters },
  });
}

module.exports = { filterOptions };
