"use strict";

const mongoose = require("mongoose");
const Product = require("../product/product.model");
const Category = require("../category/category.model");
const Brand = require("../brand/brand.model");
const productService = require("../product/product.service");
const ApiError = require("../../shared/ApiError");
const { mapCatalogRecord } = require("../../shared/catalogSchemas");
const {
  PRODUCT_STATUS,
  PRODUCT_VISIBILITY,
  CATALOG_STATUS,
  VISIBILITY,
} = require("../../shared/constants");

/**
 * The public storefront read model.
 *
 * A thin layer over the product query rather than a second implementation of
 * it: the visibility rules (published, active, public) are subtle and must not
 * exist in two places, so this resolves slugs to ids and delegates.
 */

async function categoryIdForSlug(slug) {
  const category = await Category.findOne({ slug, deletedAt: null }).select({ _id: 1 }).lean();

  if (!category) {
    throw ApiError.notFound("Category not found", { code: "CATEGORY_NOT_FOUND" });
  }

  return String(category._id);
}

async function categoryIdsForSlugs(slugs) {
  if (!slugs?.length) return undefined;

  const categories = await Category.find({ slug: { $in: slugs }, deletedAt: null })
    .select({ _id: 1 })
    .lean();

  // An unknown slug contributes no id, which would silently widen the result
  // set rather than narrowing it - the opposite of what was asked for.
  if (categories.length !== new Set(slugs).size) {
    throw ApiError.notFound("One or more categories do not exist", { code: "CATEGORY_NOT_FOUND" });
  }

  return categories.map((category) => String(category._id));
}

async function brandIdsForSlugs(slugs) {
  if (!slugs?.length) return undefined;

  const brands = await Brand.find({ slug: { $in: slugs }, deletedAt: null }).select({ _id: 1 }).lean();

  // An unknown brand slug yields no ids for it, which would silently widen the
  // result set rather than narrowing it - the opposite of what the shopper
  // asked for. Better to say so.
  if (brands.length !== new Set(slugs).size) {
    throw ApiError.notFound("One or more brands do not exist", { code: "BRAND_NOT_FOUND" });
  }

  return brands.map((brand) => String(brand._id));
}

/**
 * Paginated storefront listing. Returns the lightweight card shape.
 */
async function list(params) {
  const [categoryIds, brandIds] = await Promise.all([
    categoryIdsForSlugs(params.categorySlugs),
    brandIdsForSlugs(params.brandSlugs),
  ]);

  return productService.list({
    categoryIds,
    brandIds,
    search: params.search,
    filters: params.filters,
    price: params.price,
    inStock: params.inStock,
    featured: params.featured,
    sort: params.sort,
    pagination: params.pagination,
    projection: "card",
  });
}

/**
 * Facets for a category's filter sidebar.
 *
 * Counts come from the database under the same visibility rules as the
 * listing, so a value showing "12" really does return 12 products.
 */
async function filterOptions(categorySlug) {
  const categoryId = await categoryIdForSlug(categorySlug);

  return productService.filters({ categoryId, filters: {} });
}

/**
 * Category ids that have at least one publicly visible product **anywhere in
 * their subtree**.
 *
 * Subtree, not direct assignment, because that is what the tile does: clicking
 * a category calls `POST /shop` with its slug, which expands to the subtree.
 * Counting only direct assignments would hide a parent whose products all live
 * in its children - a tile that would have worked perfectly.
 *
 * One `distinct` returns the categories that carry products directly (a small
 * array of ids, not the products), and the rollup happens in memory against
 * the category tree, which is small. The alternative - a `$lookup` per
 * category - is a query per tile.
 */
async function categoriesWithProducts() {
  const [directlyStocked, categories] = await Promise.all([
    Product.distinct("categoryIds", {
      status: { $in: [PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.OUT_OF_STOCK] },
      visibility: PRODUCT_VISIBILITY.PUBLIC,
      deletedAt: null,
      publishedAt: { $ne: null, $lte: new Date() },
    }),
    Category.find({ deletedAt: null }).select({ _id: 1, parentId: 1 }).lean(),
  ]);

  const stocked = new Set(directlyStocked.map(String));
  const parentOf = new Map(categories.map((c) => [String(c._id), c.parentId ? String(c.parentId) : null]));

  // Walk each stocked category up to the root, marking ancestors on the way.
  const withProducts = new Set();
  for (const id of stocked) {
    let cursor = id;
    let hops = 0;
    // The hop guard stops a cycle - which the tree should never contain, but
    // a bad parent edit would - from spinning forever.
    while (cursor && !withProducts.has(cursor) && hops < 50) {
      withProducts.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
      hops += 1;
    }
  }

  return withProducts;
}

/**
 * Storefront category list.
 *
 * Two independent filters, because they answer different questions:
 *
 *   - `showInHome` is **curation**: has someone chosen to surface this?
 *     Omitted, the flag is ignored entirely.
 *   - "has at least one product" is **safety**: a tile that leads to an empty
 *     grid is worse than one tile fewer. Applied unless `forceCategories`
 *     explicitly turns it off.
 */
async function listCategories(params) {
  const filter = {
    deletedAt: null,
    status: CATALOG_STATUS.ACTIVE,
    visibility: VISIBILITY.PUBLIC,
  };

  if (params.showInHome !== undefined) filter.showInHome = params.showInHome;

  if (params.search) {
    filter.name = { $regex: escapeRegex(params.search), $options: "i" };
  }

  if (!params.forceCategories) {
    const withProducts = await categoriesWithProducts();

    // An empty set would make `$in: []` match nothing, which is the correct
    // answer: no category has anything to sell.
    filter._id = { $in: [...withProducts].map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const { page, limit } = params.pagination;

  const [items, total] = await Promise.all([
    Category.find(filter)
      // Minimal shape: what a tile renders, nothing else.
      .select({ _id: 1, name: 1, slug: 1, image: 1, showInHome: 1, sortOrder: 1, parentId: 1 })
      .sort({ sortOrder: 1, name: 1 })
      .skip(page * limit)
      .limit(limit)
      .lean(),
    Category.countDocuments(filter),
  ]);

  return {
    items: items.map(({ _id, parentId, ...rest }) => ({
      id: String(_id),
      parentId: parentId ? String(parentId) : null,
      ...rest,
    })),
    total,
    page,
    limit,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Full product detail for a product page.
 *
 * Applies exactly the same visibility gate as the listing, so a product that
 * is hidden, unpublished or draft 404s here too - otherwise a guessable slug
 * would be a preview link for unreleased products.
 */
async function getBySlug(slug) {
  const product = await Product.findOne({ slug, deletedAt: null }).select({ _id: 1 }).lean();

  if (!product) throw ApiError.notFound("Product not found");

  // `publicOnly` re-applies the status/visibility/publishedAt gate, and 404s
  // rather than 403s so an unpublished slug is indistinguishable from a
  // nonexistent one.
  return productService.getById(String(product._id), { publicOnly: true });
}

module.exports = { list, filterOptions, listCategories, getBySlug, mapCatalogRecord };
