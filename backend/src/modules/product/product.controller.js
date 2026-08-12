"use strict";

const productService = require("./product.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");
const { ROLES } = require("../../shared/constants");

// Catalog routes are served to anonymous, customer and admin callers by the
// same handler. This is the single place that decides whether unpublished
// products are visible, so no individual endpoint can forget the check.
function viewerContext(req) {
  return { viewerIsAdmin: req.user?.role === ROLES.ADMIN };
}

async function list(req, res) {
  const { items, total, page, limit } = await productService.list(
    req.validated.query,
    viewerContext(req)
  );

  return sendResponse(res, {
    message: "Products retrieved",
    data: { products: items },
    meta: paginationMeta({ page, limit, total }),
  });
}

async function getBySlug(req, res) {
  const product = await productService.getBySlug(
    req.validated.params.slug,
    viewerContext(req)
  );

  return sendResponse(res, { message: "Product retrieved", data: { product } });
}

async function create(req, res) {
  const product = await productService.create(req.validated.body, req.user.id);

  return sendResponse(res, {
    statusCode: 201,
    message: "Product created",
    data: { product },
  });
}

async function update(req, res) {
  const product = await productService.update(req.validated.params.id, req.validated.body);

  return sendResponse(res, { message: "Product updated", data: { product } });
}

async function remove(req, res) {
  const product = await productService.remove(req.validated.params.id);

  return sendResponse(res, {
    message: "Product archived",
    data: { product },
  });
}

async function adjustStock(req, res) {
  const product = await productService.adjustStock(
    req.validated.params.id,
    req.validated.body
  );

  return sendResponse(res, { message: "Stock adjusted", data: { product } });
}

module.exports = { list, getBySlug, create, update, remove, adjustStock };
