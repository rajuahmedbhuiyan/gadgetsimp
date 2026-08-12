"use strict";

const service = require("./shop.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");

async function list(req, res) {
  const result = await service.list(req.validated.body);

  return sendResponse(res, {
    message: "Products retrieved",
    data: { products: result.items },
    meta: paginationMeta(result),
  });
}

async function filterOptions(req, res) {
  const options = await service.filterOptions(req.validated.params.categorySlug);

  return sendResponse(res, { message: "Filter options retrieved", data: options });
}

async function listCategories(req, res) {
  const result = await service.listCategories(req.validated.body);

  return sendResponse(res, {
    message: "Categories retrieved",
    data: { categories: result.items },
    meta: paginationMeta(result),
  });
}

async function getBySlug(req, res) {
  const product = await service.getBySlug(req.validated.params.slug);

  return sendResponse(res, { message: "Product retrieved", data: { product } });
}

module.exports = { list, filterOptions, listCategories, getBySlug };
