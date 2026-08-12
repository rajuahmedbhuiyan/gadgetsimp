"use strict";

const mongoose = require("mongoose");
const Category = require("./category.model");
const Attribute = require("../attribute/attribute.model");
const ApiError = require("../../shared/ApiError");
const { withTransaction } = require("../../config/database");
const { CATALOG_STATUS, VISIBILITY } = require("../../shared/constants");
const { mapCatalogRecord } = require("../../shared/catalogSchemas");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parentSummary(category) {
  if (!category) return null;
  return {
    id: String(category._id),
    name: category.name,
    slug: category.slug,
  };
}

function attributeSummary(attribute) {
  return {
    id: String(attribute._id),
    name: attribute.name,
    key: attribute.key,
    source: attribute.source,
    type: attribute.type,
  };
}

/**
 * Resolves relationship ids in two batched queries. Category responses never
 * expose bare relationship ids, and a list never degrades into N+1 queries.
 */
async function presentCategories(records) {
  if (records.length === 0) return [];

  const plain = records.map((record) =>
    typeof record.toObject === "function" ? record.toObject() : record
  );
  const parentIds = [...new Set(plain.map((record) => record.parentId).filter(Boolean).map(String))];
  const attributeIds = [
    ...new Set(plain.flatMap((record) => record.attributes ?? []).map(String)),
  ];

  const [parents, attributes] = await Promise.all([
    parentIds.length
      ? Category.find({ _id: { $in: parentIds }, deletedAt: null })
          .select({ name: 1, slug: 1 })
          .lean()
      : [],
    attributeIds.length
      ? Attribute.find({ _id: { $in: attributeIds }, deletedAt: null })
          .select({ name: 1, key: 1, source: 1, type: 1 })
          .lean()
      : [],
  ]);

  const parentsById = new Map(parents.map((parent) => [String(parent._id), parent]));
  const attributesById = new Map(
    attributes.map((attribute) => [String(attribute._id), attribute])
  );

  return plain.map((record) => {
    const result = mapCatalogRecord(record);
    result.parentId = record.parentId
      ? parentSummary(parentsById.get(String(record.parentId)))
      : null;
    result.attributes = (record.attributes ?? [])
      .map((attributeId) => attributesById.get(String(attributeId)))
      .filter(Boolean)
      .map(attributeSummary);
    return result;
  });
}

async function validateAttributeReferences(attributes = []) {
  if (new Set(attributes).size !== attributes.length) {
    throw ApiError.unprocessable("A category cannot contain the same attribute twice", {
      code: "CATEGORY_ATTRIBUTE_DUPLICATE",
    });
  }
  if (attributes.length === 0) return;

  const found = await Attribute.find({
    _id: { $in: attributes },
    status: CATALOG_STATUS.ACTIVE,
    deletedAt: null,
  })
    .select({ _id: 1 })
    .lean();

  if (found.length !== attributes.length) {
    throw ApiError.unprocessable("One or more category attributes are invalid or inactive", {
      code: "CATEGORY_ATTRIBUTE_INVALID",
    });
  }
}

async function validateParent(categoryId, parentId) {
  if (!parentId) return;
  if (categoryId && String(categoryId) === String(parentId)) {
    throw ApiError.unprocessable("A category cannot be its own parent", {
      code: "CATEGORY_PARENT_INVALID",
    });
  }

  let current = await Category.findOne({ _id: parentId, deletedAt: null }).select({ parentId: 1 }).lean();
  if (!current) throw ApiError.unprocessable("Parent category does not exist", { code: "CATEGORY_PARENT_INVALID" });

  while (current?.parentId) {
    if (categoryId && String(current.parentId) === String(categoryId)) {
      throw ApiError.unprocessable("Category hierarchy cannot contain a cycle", {
        code: "CATEGORY_CYCLE",
      });
    }
    current = await Category.findOne({ _id: current.parentId, deletedAt: null })
      .select({ parentId: 1 })
      .lean();
  }
}

async function create(input, actor) {
  await Promise.all([validateAttributeReferences(input.attributes), validateParent(null, input.parentId)]);
  const category = await Category.create({ ...input, createdBy: actor.id, updatedBy: actor.id });
  const [result] = await presentCategories([category]);
  return result;
}

async function update(id, input, actor) {
  const category = await Category.findOne({ _id: id, deletedAt: null });
  if (!category) throw ApiError.notFound("Category not found");

  await Promise.all([
    input.attributes ? validateAttributeReferences(input.attributes) : Promise.resolve(),
    input.parentId !== undefined ? validateParent(id, input.parentId) : Promise.resolve(),
  ]);

  Object.assign(category, input, { updatedBy: actor.id });
  await category.save();
  const [result] = await presentCategories([category]);
  return result;
}

async function getById(id, { configuration = false } = {}) {
  const category = await Category.findOne({
    _id: id,
    deletedAt: null,
    status: CATALOG_STATUS.ACTIVE,
    visibility: VISIBILITY.PUBLIC,
  }).lean();
  if (!category) throw ApiError.notFound("Category not found");

  if (!configuration) {
    const [result] = await presentCategories([category]);
    return result;
  }

  const result = mapCatalogRecord(category);
  const parent = category.parentId
    ? await Category.findOne({ _id: category.parentId, deletedAt: null })
        .select({ name: 1, slug: 1 })
        .lean()
    : null;
  result.parentId = parentSummary(parent);

  const attributes = await Attribute.find({ _id: { $in: result.attributes }, deletedAt: null })
    .sort({ name: 1, _id: 1 })
    .lean();
  const byId = new Map(attributes.map((attribute) => [String(attribute._id), mapCatalogRecord(attribute)]));
  result.attributes = result.attributes
    .map((attributeId) => byId.get(String(attributeId)))
    .filter(Boolean);
  return result;
}

async function list(params) {
  const filter = {
    deletedAt: null,
    status: CATALOG_STATUS.ACTIVE,
    visibility: VISIBILITY.PUBLIC,
  };
  if (params.parentId !== undefined) filter.parentId = params.parentId;
  if (params.search) {
    const expression = new RegExp(escapeRegex(params.search), "i");
    filter.$or = [{ name: expression }, { slug: expression }];
  }

  const { page, limit } = params.pagination;
  const [records, total] = await Promise.all([
    Category.find(filter).sort({ sortOrder: 1, name: 1 }).skip(page * limit).limit(limit).lean(),
    Category.countDocuments(filter),
  ]);
  return { items: await presentCategories(records), total, page, limit };
}

/**
 * Returns a nested category tree without changing the ordinary paginated
 * filter endpoint. When search is present, matching nodes and their ancestors
 * are retained so the result never loses its hierarchy context.
 */
async function filterGrouped(params) {
  const records = await Category.find({
    deletedAt: null,
    status: CATALOG_STATUS.ACTIVE,
    visibility: VISIBILITY.PUBLIC,
  })
    .select({
      name: 1,
      slug: 1,
      description: 1,
      parentId: 1,
      status: 1,
      visibility: 1,
      image: 1,
      attributes: 1,
      seo: 1,
      sortOrder: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort({ sortOrder: 1, name: 1, _id: 1 })
    .lean();

  const byId = new Map(records.map((record) => [String(record._id), record]));
  const rootId = params.parentId == null ? null : String(params.parentId);

  if (rootId && !byId.has(rootId)) {
    throw ApiError.notFound("Parent category not found");
  }

  const inRequestedSubtree = new Set();
  const childrenByParent = new Map();
  for (const record of records) {
    const parentKey = record.parentId == null ? null : String(record.parentId);
    const children = childrenByParent.get(parentKey) ?? [];
    children.push(record);
    childrenByParent.set(parentKey, children);
  }

  function collectDescendants(parentKey) {
    for (const child of childrenByParent.get(parentKey) ?? []) {
      const id = String(child._id);
      inRequestedSubtree.add(id);
      collectDescendants(id);
    }
  }
  collectDescendants(rootId);

  let included = inRequestedSubtree;
  if (params.search) {
    const needle = params.search.toLocaleLowerCase();
    included = new Set();

    for (const record of records) {
      const id = String(record._id);
      if (!inRequestedSubtree.has(id)) continue;
      const matches = [record.name, record.slug, record.description]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase().includes(needle));
      if (!matches) continue;

      included.add(id);
      let parentId = record.parentId == null ? null : String(record.parentId);
      while (parentId && parentId !== rootId && inRequestedSubtree.has(parentId)) {
        included.add(parentId);
        parentId = byId.get(parentId)?.parentId == null
          ? null
          : String(byId.get(parentId).parentId);
      }
    }
  }

  const presented = await presentCategories(records);
  const presentedById = new Map(presented.map((record) => [record.id, record]));

  function buildChildren(parentKey) {
    return (childrenByParent.get(parentKey) ?? [])
      .filter((record) => included.has(String(record._id)))
      .map((record) => ({
        ...presentedById.get(String(record._id)),
        children: buildChildren(String(record._id)),
      }));
  }

  return buildChildren(rootId);
}

/**
 * Updates only hierarchy fields. The request cannot overwrite names, slugs,
 * SEO, media, attributes, lifecycle state, or audit timestamps.
 */
async function sort(updates, actor) {
  const requestedIds = updates.map((entry) => entry.id);
  const records = await Category.find({ deletedAt: null }).select({ _id: 1, parentId: 1 }).lean();
  const byId = new Map(records.map((record) => [String(record._id), record]));

  const missingCategory = requestedIds.find((id) => !byId.has(id));
  if (missingCategory) {
    throw ApiError.unprocessable("One or more categories do not exist", {
      code: "CATEGORY_SORT_ID_INVALID",
      errors: [{ field: "categories", message: "Every category id must exist" }],
    });
  }

  for (const entry of updates) {
    if (entry.parentId != null && !byId.has(entry.parentId)) {
      throw ApiError.unprocessable("One or more parent categories do not exist", {
        code: "CATEGORY_PARENT_INVALID",
        errors: [{ field: "categories.parentId", message: "Parent category does not exist" }],
      });
    }
    if (entry.parentId === entry.id) {
      throw ApiError.unprocessable("A category cannot be its own parent", {
        code: "CATEGORY_PARENT_INVALID",
      });
    }
  }

  const finalParents = new Map(
    records.map((record) => [
      String(record._id),
      record.parentId == null ? null : String(record.parentId),
    ])
  );
  for (const entry of updates) {
    if (entry.parentId !== undefined) finalParents.set(entry.id, entry.parentId);
  }

  for (const categoryId of finalParents.keys()) {
    const seen = new Set([categoryId]);
    let parentId = finalParents.get(categoryId);
    while (parentId) {
      if (seen.has(parentId)) {
        throw ApiError.unprocessable("Category hierarchy cannot contain a cycle", {
          code: "CATEGORY_CYCLE",
        });
      }
      seen.add(parentId);
      parentId = finalParents.get(parentId) ?? null;
    }
  }

  await withTransaction(async (session) => {
    const operations = updates.map((entry) => {
      const fields = { sortOrder: entry.sortOrder, updatedBy: actor.id };
      if (entry.parentId !== undefined) fields.parentId = entry.parentId;
      return {
        updateOne: {
          filter: { _id: entry.id, deletedAt: null },
          update: { $set: fields },
        },
      };
    });
    await Category.bulkWrite(operations, session ? { session } : {});
  });

  const updated = await Category.find({ _id: { $in: requestedIds }, deletedAt: null })
    .select({ parentId: 1, sortOrder: 1 })
    .lean();
  const updatedById = new Map(updated.map((record) => [String(record._id), record]));
  const parentIds = [...new Set(updated.map((record) => record.parentId).filter(Boolean).map(String))];
  const parents = parentIds.length
    ? await Category.find({ _id: { $in: parentIds }, deletedAt: null })
        .select({ name: 1, slug: 1 })
        .lean()
    : [];
  const parentsById = new Map(parents.map((parent) => [String(parent._id), parent]));

  return requestedIds.map((id) => {
    const record = updatedById.get(id);
    return {
      id,
      parentId: record.parentId == null
        ? null
        : parentSummary(parentsById.get(String(record.parentId))),
      sortOrder: record.sortOrder,
    };
  });
}

async function remove(id, actor) {
  const objectId = new mongoose.Types.ObjectId(id);
  const child = await Category.exists({ parentId: objectId, deletedAt: null });
  if (child) {
    throw ApiError.conflict("Move or archive child categories first", { code: "CATEGORY_HAS_CHILDREN" });
  }

  const category = await Category.findOneAndUpdate(
    { _id: objectId, deletedAt: null },
    { status: CATALOG_STATUS.ARCHIVED, deletedAt: new Date(), updatedBy: actor.id },
    { new: true }
  );
  if (!category) throw ApiError.notFound("Category not found");
  return { id: String(category._id) };
}

/**
 * Sets the home-page flag on several categories at once.
 *
 * A single `updateMany` rather than a loop of saves: one round trip, and the
 * database applies it as one operation, so a partial failure cannot leave half
 * the selection flagged.
 *
 * Unknown ids are reported rather than ignored - a client that selected six
 * rows and had four updated should be told, not left to notice later.
 */
async function setShowInHome({ ids, showInHome }, actor) {
  const existing = await Category.find({ _id: { $in: ids }, deletedAt: null })
    .select({ _id: 1 })
    .lean();

  if (existing.length !== ids.length) {
    const found = new Set(existing.map((category) => String(category._id)));
    throw ApiError.unprocessable("One or more categories do not exist", {
      code: "CATEGORY_NOT_FOUND",
      errors: ids
        .filter((id) => !found.has(String(id)))
        .map((id) => ({ field: "ids", message: `Unknown category ${id}` })),
    });
  }

  await Category.updateMany(
    { _id: { $in: ids }, deletedAt: null },
    { $set: { showInHome, updatedBy: actor.id } }
  );

  const updated = await Category.find({ _id: { $in: ids } }).lean();

  return updated.map((category) => mapCatalogRecord(category));
}

module.exports = { create, update, getById, list, filterGrouped, sort, remove, setShowInHome };
