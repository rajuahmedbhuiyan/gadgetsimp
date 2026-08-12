"use strict";

const service = require("./brand.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");
const actor = (req) => ({ id: req.user.id, role: req.user.role });

async function create(req, res) {
  const brand = await service.create(req.validated.body, actor(req));
  return sendResponse(res, { statusCode: 201, message: "Brand created", data: { brand } });
}
async function update(req, res) {
  const brand = await service.update(req.validated.params.id, req.validated.body, actor(req));
  return sendResponse(res, { message: "Brand updated", data: { brand } });
}
async function getById(req, res) {
  const brand = await service.getById(req.validated.params.id);
  return sendResponse(res, { message: "Brand retrieved", data: { brand } });
}
async function list(req, res) {
  const result = await service.list(req.validated.body);
  return sendResponse(res, { message: "Brands retrieved", data: { brands: result.items }, meta: paginationMeta(result) });
}
async function remove(req, res) {
  const deleted = await service.remove(req.validated.params.id, actor(req));
  return sendResponse(res, { message: "Brand archived", data: { deleted } });
}
module.exports = { create, update, getById, list, remove };
