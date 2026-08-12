"use strict";

const slugify = require("slugify");
const Category = require("./category.model");
const ApiError = require("../../shared/ApiError");
const QueryFeatures = require("../../shared/queryFeatures");

const MAX_DEPTH = 4;

async function create(input) {
  const { parent, ...rest } = input;
  const { parentDoc, parentPath, depth } = await resolvePlacement(parent);

  // The slug is computed here rather than left to the model hook because the
  // path depends on it, and the hook has not run yet at this point.
  const slug = slugify(input.name, { lower: true, strict: true, trim: true });

  const category = await Category.create({
    ...rest,
    slug,
    parent: parentDoc?._id ?? null,
    path: `${parentPath}/${slug}`,
    depth,
  });

  return category.toJSON();
}

/**
 * Updating a category can change its slug, its parent, or both - and either
 * invalidates the stored `path` of every descendant. The flow is therefore:
 * settle the document, recompute its own path, then bulk-rewrite the subtree.
 */
async function update(categoryId, updates) {
  const category = await Category.findById(categoryId);

  if (!category) throw ApiError.notFound("Category not found");

  const previousPath = category.path;
  const previousDepth = category.depth;

  const isMoving =
    updates.parent !== undefined &&
    String(updates.parent ?? "") !== String(category.parent ?? "");

  if (isMoving) {
    if (String(updates.parent) === String(categoryId)) {
      throw ApiError.badRequest("A category cannot be its own parent");
    }

    const { parentDoc, depth } = await resolvePlacement(updates.parent);

    // Re-parenting a node under one of its own descendants would detach the
    // whole subtree from the root and create a cycle.
    if (
      parentDoc &&
      (parentDoc.path === previousPath || parentDoc.path.startsWith(`${previousPath}/`))
    ) {
      throw ApiError.badRequest("Cannot move a category beneath one of its own descendants");
    }

    category.parent = parentDoc?._id ?? null;
    category.depth = depth;
  }

  const { parent, ...scalarUpdates } = updates;
  Object.assign(category, scalarUpdates);

  // First save settles the slug via the model's pre-validate hook.
  await category.save();

  const parentPath = category.parent
    ? ((await Category.findById(category.parent).select("path").lean())?.path ?? "")
    : "";
  const nextPath = `${parentPath}/${category.slug}`;

  if (nextPath !== previousPath || category.depth !== previousDepth) {
    category.path = nextPath;
    await category.save();
    await rewriteDescendantPaths(previousPath, nextPath, previousDepth - category.depth);
  }

  return category.toJSON();
}

async function remove(categoryId) {
  const category = await Category.findById(categoryId);

  if (!category) throw ApiError.notFound("Category not found");

  const childCount = await Category.countDocuments({ parent: category._id });

  if (childCount > 0) {
    throw ApiError.conflict(
      "Cannot delete a category that still has subcategories. Move or delete them first."
    );
  }

  // Products reference categories, so deleting one out from under them would
  // leave dangling references. Required lazily to avoid a circular import.
  const Product = require("../product/product.model");
  const productCount = await Product.countDocuments({ category: category._id });

  if (productCount > 0) {
    throw ApiError.conflict(
      `Cannot delete a category still assigned to ${productCount} product(s). Reassign them first.`
    );
  }

  await category.deleteOne();
}

async function list(params) {
  if (params.tree) return buildTree(params);

  const features = new QueryFeatures(Category.find(), params, {
    allowedFilters: ["parent", "isActive"],
    allowedSortFields: ["displayOrder", "name", "createdAt", "depth"],
    defaultSort: "displayOrder,name",
  }).apply();

  return features.execute();
}

/**
 * Loads the whole tree in one query and assembles it in memory.
 *
 * A catalog taxonomy is small (hundreds of rows at most) and read on nearly
 * every page, so one fetch plus an O(n) grouping beats a recursive
 * `$graphLookup` or a query per level.
 */
async function buildTree({ isActive } = {}) {
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive;

  const categories = await Category.find(filter)
    .sort({ depth: 1, displayOrder: 1, name: 1 })
    .lean();

  const byId = new Map();
  const roots = [];

  for (const category of categories) {
    byId.set(String(category._id), {
      id: String(category._id),
      name: category.name,
      slug: category.slug,
      imageUrl: category.imageUrl,
      depth: category.depth,
      displayOrder: category.displayOrder,
      isActive: category.isActive,
      children: [],
    });
  }

  for (const category of categories) {
    const node = byId.get(String(category._id));
    const parent = category.parent ? byId.get(String(category.parent)) : null;

    // A node whose parent was filtered out is promoted to a root rather than
    // silently dropped from the response.
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return { items: roots, total: roots.length, page: 1, limit: roots.length };
}

async function getBySlug(slug) {
  const category = await Category.findOne({ slug }).populate({
    path: "children",
    match: { isActive: true },
    select: "name slug imageUrl displayOrder",
    options: { sort: { displayOrder: 1, name: 1 } },
  });

  if (!category) throw ApiError.notFound("Category not found");

  return category.toJSON();
}

/**
 * Returns a category id together with every descendant id, so a product
 * listing filtered by "Electronics" also returns items filed under
 * "Electronics > Laptops > Gaming".
 */
async function getSubtreeIds(categoryId) {
  const category = await Category.findById(categoryId).select("path").lean();

  if (!category) throw ApiError.notFound("Category not found");

  const descendants = await Category.find({
    path: { $regex: `^${escapeRegex(category.path)}/` },
  })
    .select("_id")
    .lean();

  return [category._id, ...descendants.map((doc) => doc._id)];
}

/**
 * Works out the path prefix and depth a category will occupy under `parentId`.
 */
async function resolvePlacement(parentId) {
  if (!parentId) return { parentDoc: null, parentPath: "", depth: 0 };

  const parentDoc = await Category.findById(parentId);

  if (!parentDoc) {
    throw ApiError.badRequest("Parent category does not exist", {
      errors: [{ field: "parent", message: "Unknown category id" }],
    });
  }

  if (parentDoc.depth + 1 > MAX_DEPTH) {
    throw ApiError.badRequest(`Category nesting is limited to ${MAX_DEPTH} levels`);
  }

  return { parentDoc, parentPath: parentDoc.path, depth: parentDoc.depth + 1 };
}

/**
 * Rewrites the stored paths of a moved or renamed subtree.
 *
 * One bulk pass rather than a save per node: a change high in the tree can
 * touch every category, and N round trips would be visible to the admin.
 */
async function rewriteDescendantPaths(previousPath, nextPath, depthDelta) {
  if (previousPath === nextPath && depthDelta === 0) return;

  const descendants = await Category.find({
    path: { $regex: `^${escapeRegex(previousPath)}/` },
  })
    .select("path depth")
    .lean();

  if (descendants.length === 0) return;

  await Category.bulkWrite(
    descendants.map((descendant) => ({
      updateOne: {
        filter: { _id: descendant._id },
        update: {
          $set: {
            path: nextPath + descendant.path.slice(previousPath.length),
            depth: descendant.depth - depthDelta,
          },
        },
      },
    }))
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  create,
  update,
  remove,
  list,
  getBySlug,
  getSubtreeIds,
  MAX_DEPTH,
};
