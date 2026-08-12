"use strict";

const service = require("./product.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");
const actor = (req) => ({ id: req.user.id, role: req.user.role });

async function create(req, res) {
  const product = await service.create(req.validated.body, actor(req));
  return sendResponse(res, { statusCode: 201, message: "Product created", data: { product } });
}

async function update(req, res) {
  const product = await service.update(req.validated.params.id, req.validated.body, actor(req));
  return sendResponse(res, { message: "Product updated", data: { product } });
}

async function getById(req, res) {
  const product = await service.getById(req.validated.params.id, { publicOnly: false });
  return sendResponse(res, { message: "Product retrieved", data: { product } });
}

async function list(req, res) {
  const result = await service.list(req.validated.body);
  return sendResponse(res, {
    message: "Products retrieved",
    data: { products: result.items },
    meta: paginationMeta(result),
  });
}

async function remove(req, res) {
  const deleted = await service.remove(req.validated.params.id, actor(req));
  return sendResponse(res, { message: "Product archived", data: { deleted } });
}

module.exports = { create, update, getById, list, remove };
