"use strict";

const service = require("./category.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");

const actor = (req) => ({ id: req.user.id, role: req.user.role });

async function create(req, res) {
  const category = await service.create(req.validated.body, actor(req));
  return sendResponse(res, { statusCode: 201, message: "Category created", data: { category } });
}
async function update(req, res) {
  const category = await service.update(req.validated.params.id, req.validated.body, actor(req));
  return sendResponse(res, { message: "Category updated", data: { category } });
}
async function getById(req, res) {
  const category = await service.getById(req.validated.params.id);
  return sendResponse(res, { message: "Category retrieved", data: { category } });
}
async function configuration(req, res) {
  const category = await service.getById(req.validated.params.id, { configuration: true });
  return sendResponse(res, { message: "Category configuration retrieved", data: { category } });
}
async function list(req, res) {
  const result = await service.list(req.validated.body);
  return sendResponse(res, { message: "Categories retrieved", data: { categories: result.items }, meta: paginationMeta(result) });
}
async function filterGrouped(req, res) {
  const categories = await service.filterGrouped(req.validated.body);
  return sendResponse(res, {
    message: "Grouped categories retrieved",
    data: { categories },
  });
}
async function sort(req, res) {
  const categories = await service.sort(req.validated.body.categories, actor(req));
  return sendResponse(res, {
    message: "Category positions updated",
    data: { categories },
  });
}
async function remove(req, res) {
  const deleted = await service.remove(req.validated.params.id, actor(req));
  return sendResponse(res, { message: "Category archived", data: { deleted } });
}

async function setShowInHome(req, res) {
  const categories = await service.setShowInHome(req.validated.body, actor(req));

  return sendResponse(res, {
    message: `Home visibility updated for ${categories.length} categor${categories.length === 1 ? "y" : "ies"}`,
    data: { categories },
  });
}

module.exports = {
  setShowInHome, create, update, getById, configuration, list, filterGrouped, sort, remove };
