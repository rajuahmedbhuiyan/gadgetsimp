"use strict";

const service = require("./variation.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");
const actor = (req) => ({ id: req.user.id, role: req.user.role });

async function generate(req, res) {
  const variations = service.generate(req.validated.body);
  return sendResponse(res, { message: "Variation combinations generated", data: { variations } });
}
async function filter(req, res) {
  const result = await service.filter(req.validated.body);
  return sendResponse(res, { message: "Variations retrieved", data: { variations: result.items }, meta: paginationMeta(result) });
}
async function getById(req, res) {
  const variation = await service.getById(req.validated.params.id);
  return sendResponse(res, { message: "Variation retrieved", data: { variation } });
}
async function patch(req, res) {
  const variation = await service.patch(req.validated.params.id, req.validated.body, actor(req));
  return sendResponse(res, { message: "Variation updated", data: { variation } });
}
async function remove(req, res) {
  const deleted = await service.remove(req.validated.params.id, actor(req));
  return sendResponse(res, { message: "Variation deleted", data: { deleted } });
}

module.exports = { generate, filter, getById, patch, remove };
