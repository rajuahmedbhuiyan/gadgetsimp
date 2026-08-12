"use strict";

const mongoose = require("mongoose");
const Product = require("./product.model");
const Category = require("../category/category.model");
const categoryService = require("../category/category.service");
const ApiError = require("../../shared/ApiError");
const QueryFeatures = require("../../shared/queryFeatures");
const { PRODUCT_STATUS } = require("../../shared/constants");

const PUBLIC_LIST_FIELDS =
  "title slug summary brand price compareAtPrice currency images status stock variants ratingAverage ratingCount soldCount isFeatured category createdAt";

async function create(input, actorId) {
  const category = await Category.findById(input.category).select("path").lean();

  if (!category) {
    throw ApiError.badRequest("Category does not exist", {
      errors: [{ field: "category", message: "Unknown category id" }],
    });
  }

  const product = await Product.create({
    ...input,
    categoryPath: category.path,
    createdBy: actorId,
  });

  return product.toJSON();
}

async function update(productId, updates) {
  const product = await Product.findById(productId);

  if (!product) throw ApiError.notFound("Product not found");

  // Moving a product between categories must refresh the denormalised path,
  // otherwise subtree listings keep returning it under the old branch.
  if (updates.category && String(updates.category) !== String(product.category)) {
    const category = await Category.findById(updates.category).select("path").lean();

    if (!category) {
      throw ApiError.badRequest("Category does not exist", {
        errors: [{ field: "category", message: "Unknown category id" }],
      });
    }

    product.categoryPath = category.path;
  }

  Object.assign(product, updates);
  await product.save();

  return product.toJSON();
}

async function remove(productId) {
  const product = await Product.findById(productId);

  if (!product) throw ApiError.notFound("Product not found");

  // Archive rather than delete. Order history references products, and hard
  // deletes turn a customer's past orders into broken references.
  product.status = PRODUCT_STATUS.ARCHIVED;
  await product.save();

  return product.toJSON();
}

/**
 * Public catalog listing.
 *
 * `viewerIsAdmin` decides whether drafts and archived products are visible.
 * Anonymous and customer callers are forced to `status: active` regardless of
 * what they put in the query string - otherwise `?status=draft` would expose
 * unreleased products and their prices.
 */
async function list(params, { viewerIsAdmin = false } = {}) {
  const filter = {};

  if (viewerIsAdmin) {
    if (params.status) filter.status = params.status;
  } else {
    filter.status = PRODUCT_STATUS.ACTIVE;
  }

  if (params.category) {
    const ids = await resolveCategoryFilter(params.category);
    filter.category = { $in: ids };
  }

  if (params.brand) filter.brand = params.brand;

  if (params.tags) {
    filter.tags = { $in: params.tags.split(",").map((tag) => tag.trim()).filter(Boolean) };
  }

  if (params.minPrice != null || params.maxPrice != null) {
    filter.price = {};
    if (params.minPrice != null) filter.price.$gte = params.minPrice;
    if (params.maxPrice != null) filter.price.$lte = params.maxPrice;
  }

  if (params.inStock === true) filter.stock = { $gt: 0 };
  if (params.isFeatured !== undefined) filter.isFeatured = params.isFeatured;
  if (params.minRating != null) filter.ratingAverage = { $gte: params.minRating };

  const base = Product.find(filter).populate("category", "name slug path");

  const features = new QueryFeatures(base, params, {
    // Filtering is handled above, so nothing further is allowed through the
    // generic path - this keeps arbitrary query keys out of the database.
    allowedFilters: [],
    allowedSortFields: ["price", "createdAt", "ratingAverage", "soldCount", "title"],
    defaultSort: "-createdAt",
  });

  // Relevance ordering only makes sense when there is a search term, and it
  // requires a projected score field to sort on.
  if (params.search) {
    features.query = features.query
      .select({ score: { $meta: "textScore" } })
      .sort({ score: { $meta: "textScore" } });
    features.search().paginate();
  } else {
    features.apply();
  }

  features.query = features.query.select(PUBLIC_LIST_FIELDS);

  return features.execute();
}

async function getBySlug(slug, { viewerIsAdmin = false } = {}) {
  const filter = { slug };
  if (!viewerIsAdmin) filter.status = PRODUCT_STATUS.ACTIVE;

  const product = await Product.findOne(filter).populate("category", "name slug path");

  if (!product) throw ApiError.notFound("Product not found");

  return product.toJSON();
}

async function getById(productId, { viewerIsAdmin = false } = {}) {
  const filter = { _id: productId };
  if (!viewerIsAdmin) filter.status = PRODUCT_STATUS.ACTIVE;

  const product = await Product.findOne(filter).populate("category", "name slug path");

  if (!product) throw ApiError.notFound("Product not found");

  return product.toJSON();
}

/**
 * Applies a signed stock delta atomically.
 *
 * The guard is in the filter, not in JavaScript: `stock: { $gte: -delta }`
 * means the database itself refuses the write when it would go negative. A
 * read-then-write in application code loses that race whenever two requests
 * decrement the last unit at the same moment - the classic oversell bug.
 */
async function adjustStock(productId, { delta, variantSku }) {
  if (variantSku) {
    const updated = await Product.findOneAndUpdate(
      {
        _id: productId,
        variants: { $elemMatch: { sku: variantSku.toUpperCase(), stock: { $gte: -delta } } },
      },
      { $inc: { "variants.$.stock": delta } },
      { returnDocument: "after" }
    );

    if (!updated) {
      await assertProductExists(productId);
      throw ApiError.conflict("Insufficient stock for this variant", {
        code: "INSUFFICIENT_STOCK",
      });
    }

    return updated.toJSON();
  }

  const updated = await Product.findOneAndUpdate(
    { _id: productId, stock: { $gte: -delta } },
    { $inc: { stock: delta } },
    { returnDocument: "after" }
  );

  if (!updated) {
    await assertProductExists(productId);
    throw ApiError.conflict("Insufficient stock", { code: "INSUFFICIENT_STOCK" });
  }

  return updated.toJSON();
}

/**
 * Disambiguates a failed conditional update: missing product (404) versus
 * present but not enough stock (409).
 */
async function assertProductExists(productId) {
  const exists = await Product.exists({ _id: productId });
  if (!exists) throw ApiError.notFound("Product not found");
}

/**
 * Accepts either a category id or a slug and expands it to the full subtree,
 * so `?category=electronics` also returns everything filed beneath it.
 */
async function resolveCategoryFilter(value) {
  const category = mongoose.isValidObjectId(value)
    ? await Category.findById(value).select("_id").lean()
    : await Category.findOne({ slug: value }).select("_id").lean();

  if (!category) {
    throw ApiError.notFound("Category not found", {
      errors: [{ field: "category", message: "Unknown category" }],
    });
  }

  return categoryService.getSubtreeIds(category._id);
}

module.exports = {
  create,
  update,
  remove,
  list,
  getBySlug,
  getById,
  adjustStock,
};
