"use strict";

const categoryService = require("./category.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");

async function create(req, res) {
  const category = await categoryService.create(req.validated.body);

  return sendResponse(res, {
    statusCode: 201,
    message: "Category created",
    data: { category },
  });
}

async function list(req, res) {
  const { items, total, page, limit } = await categoryService.list(req.validated.query);

  if (req.validated.query.tree) {
    return sendResponse(res, {
      message: "Category tree retrieved",
      data: { categories: items },
    });
  }

  return sendResponse(res, {
    message: "Categories retrieved",
    data: { categories: items },
    meta: paginationMeta({ page, limit, total }),
  });
}

async function getBySlug(req, res) {
  const category = await categoryService.getBySlug(req.validated.params.slug);

  return sendResponse(res, { message: "Category retrieved", data: { category } });
}

async function update(req, res) {
  const category = await categoryService.update(req.validated.params.id, req.validated.body);

  return sendResponse(res, { message: "Category updated", data: { category } });
}

async function remove(req, res) {
  await categoryService.remove(req.validated.params.id);

  return sendResponse(res, { message: "Category deleted" });
}

module.exports = { create, list, getBySlug, update, remove };
