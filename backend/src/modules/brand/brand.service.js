"use strict";

const Brand = require("./brand.model");
const ApiError = require("../../shared/ApiError");
const { CATALOG_STATUS, VISIBILITY } = require("../../shared/constants");
const { mapCatalogRecord } = require("../../shared/catalogSchemas");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function create(input, actor) {
  const brand = await Brand.create({ ...input, createdBy: actor.id, updatedBy: actor.id });
  return brand.toJSON();
}

async function update(id, input, actor) {
  const brand = await Brand.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { ...input, updatedBy: actor.id },
    { new: true, runValidators: true }
  );
  if (!brand) throw ApiError.notFound("Brand not found");
  return brand.toJSON();
}

async function getById(id) {
  const brand = await Brand.findOne({
    _id: id,
    deletedAt: null,
    status: CATALOG_STATUS.ACTIVE,
    visibility: VISIBILITY.PUBLIC,
  }).lean();
  if (!brand) throw ApiError.notFound("Brand not found");
  return mapCatalogRecord(brand);
}

async function list(params) {
  const filter = { deletedAt: null, status: CATALOG_STATUS.ACTIVE, visibility: VISIBILITY.PUBLIC };
  if (params.search) {
    const expression = new RegExp(escapeRegex(params.search), "i");
    filter.$or = [{ name: expression }, { slug: expression }];
  }
  const { page, limit } = params.pagination;
  const [records, total] = await Promise.all([
    Brand.find(filter).sort({ name: 1, _id: 1 }).skip(page * limit).limit(limit).lean(),
    Brand.countDocuments(filter),
  ]);
  return { items: records.map(mapCatalogRecord), total, page, limit };
}

async function remove(id, actor) {
  const brand = await Brand.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { status: CATALOG_STATUS.ARCHIVED, deletedAt: new Date(), updatedBy: actor.id },
    { new: true }
  );
  if (!brand) throw ApiError.notFound("Brand not found");
  return { id: String(brand._id) };
}

module.exports = { create, update, getById, list, remove };
