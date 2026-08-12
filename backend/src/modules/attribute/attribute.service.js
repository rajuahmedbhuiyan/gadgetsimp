"use strict";

const Attribute = require("./attribute.model");
const ApiError = require("../../shared/ApiError");
const { mapCatalogRecord } = require("../../shared/catalogSchemas");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function create(input, actor) {
  const attribute = await Attribute.create({ ...input, createdBy: actor.id, updatedBy: actor.id });
  return attribute.toJSON();
}

async function update(id, input, actor) {
  const current = await Attribute.findOne({ _id: id, deletedAt: null });
  if (!current) throw ApiError.notFound("Attribute not found");

  Object.assign(current, input, { updatedBy: actor.id });
  await current.save();
  return current.toJSON();
}

async function getById(id) {
  const attribute = await Attribute.findOne({ _id: id, deletedAt: null });
  if (!attribute) throw ApiError.notFound("Attribute not found");
  return attribute.toJSON();
}

async function list(params) {
  const filter = { deletedAt: null };
  if (params.search) {
    const expression = new RegExp(escapeRegex(params.search), "i");
    filter.$or = [{ name: expression }, { key: expression }, { slug: expression }];
  }
  if (params.source) filter.source = params.source;
  if (params.type) filter.type = params.type;
  if (params.status) filter.status = params.status;

  const skip = params.page * params.limit;
  const [records, total] = await Promise.all([
    Attribute.find(filter).sort({ name: 1, _id: 1 }).skip(skip).limit(params.limit).lean(),
    Attribute.countDocuments(filter),
  ]);

  return { items: records.map(mapCatalogRecord), total, page: params.page, limit: params.limit };
}

async function remove(id, actor) {
  const attribute = await Attribute.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { status: "ARCHIVED", deletedAt: new Date(), updatedBy: actor.id },
    { new: true }
  );
  if (!attribute) throw ApiError.notFound("Attribute not found");
  return { id: String(attribute._id) };
}

module.exports = { create, update, getById, list, remove };
