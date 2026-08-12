"use strict";

const service = require("./attribute.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");

const actor = (req) => ({ id: req.user.id, role: req.user.role });

async function create(req, res) {
  const attribute = await service.create(req.validated.body, actor(req));
  return sendResponse(res, { statusCode: 201, message: "Attribute created", data: { attribute } });
}

async function update(req, res) {
  const attribute = await service.update(req.validated.params.id, req.validated.body, actor(req));
  return sendResponse(res, { message: "Attribute updated", data: { attribute } });
}

async function getById(req, res) {
  const attribute = await service.getById(req.validated.params.id);
  return sendResponse(res, { message: "Attribute retrieved", data: { attribute } });
}

async function list(req, res) {
  const result = await service.list(req.validated.body);
  return sendResponse(res, {
    message: "Attributes retrieved",
    data: { attributes: result.items },
    meta: paginationMeta(result),
  });
}

async function remove(req, res) {
  const deleted = await service.remove(req.validated.params.id, actor(req));
  return sendResponse(res, { message: "Attribute archived", data: { deleted } });
}

module.exports = { create, update, getById, list, remove };
