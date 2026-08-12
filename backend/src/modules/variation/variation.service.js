"use strict";

const Product = require("../product/product.model");
const Variant = require("../product/variant.model");
const ApiError = require("../../shared/ApiError");
const { mapCatalogRecord } = require("../../shared/catalogSchemas");

function productSummary(product) {
  return { id: String(product._id), name: product.name, slug: product.slug, currency: product.currency };
}

function present(record, product) {
  const result = mapCatalogRecord(record);
  if (result.options instanceof Map) result.options = Object.fromEntries(result.options);
  result.productId = productSummary(product);
  return result;
}

function cartesian(entries) {
  return entries.reduce(
    (combinations, [key, values]) => combinations.flatMap((item) => values.map((value) => ({ ...item, [key]: value }))),
    [{}]
  );
}

function generate(input) {
  const combinations = cartesian(Object.entries(input.options));
  if (combinations.length === 0 || combinations.length > 500) {
    throw ApiError.unprocessable("Variation generation must produce between 1 and 500 combinations", {
      code: "VARIATION_LIMIT_INVALID",
    });
  }

  const { options: _optionGroups, ...defaults } = input;
  return combinations.map((options, index) => ({
    options,
    ...defaults,
    sortOrder: index,
  }));
}

async function filter(params) {
  const query = { deletedAt: null };
  if (params.productId) query.productId = params.productId;
  if (params.status) query.status = params.status;
  if (params.search) query.$or = [
    { sku: { $regex: params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
    { barcode: { $regex: params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
  ];
  const { page, limit } = params.pagination;
  const [records, total] = await Promise.all([
    Variant.find(query).sort({ productId: 1, sortOrder: 1, _id: 1 }).skip(page * limit).limit(limit).lean(),
    Variant.countDocuments(query),
  ]);
  const productIds = [...new Set(records.map((record) => String(record.productId)))];
  const products = await Product.find({ _id: { $in: productIds } }).select({ name: 1, slug: 1, currency: 1 }).lean();
  const byId = new Map(products.map((product) => [String(product._id), product]));
  return { items: records.map((record) => present(record, byId.get(String(record.productId)))), total, page, limit };
}

async function getById(id) {
  const variation = await Variant.findOne({ _id: id, deletedAt: null }).lean();
  if (!variation) throw ApiError.notFound("Variation not found");
  const product = await Product.findById(variation.productId).select({ name: 1, slug: 1, currency: 1 }).lean();
  return present(variation, product);
}

async function patch(id, input, actor) {
  const variation = await Variant.findOne({ _id: id, deletedAt: null });
  if (!variation) throw ApiError.notFound("Variation not found");
  for (const [field, value] of Object.entries(input)) {
    if (field === "stock") {
      for (const [key, nested] of Object.entries(value)) variation.set(`stock.${key}`, nested);
    } else variation.set(field, value);
  }
  variation.updatedBy = actor.id;
  await variation.save();
  const product = await Product.findById(variation.productId).select({ name: 1, slug: 1, currency: 1 }).lean();
  return present(variation.toObject(), product);
}

async function remove(id, actor) {
  const variation = await Variant.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date(), updatedBy: actor.id },
    { new: true }
  );
  if (!variation) throw ApiError.notFound("Variation not found");
  return { id: String(variation._id) };
}

module.exports = { generate, filter, getById, patch, remove };
