"use strict";

const mongoose = require("mongoose");
const Product = require("./product.model");
const Variant = require("./variant.model");
const { ATTRIBUTE_SOURCE, PRODUCT_STATUS, PRODUCT_VISIBILITY } = require("../../shared/constants");
const { mapCatalogRecord } = require("../../shared/catalogSchemas");

function publicMatch({ categoryId, search }) {
  const match = {
    status: PRODUCT_STATUS.ACTIVE,
    visibility: PRODUCT_VISIBILITY.PUBLIC,
    deletedAt: null,
    publishedAt: { $ne: null, $lte: new Date() },
  };
  if (categoryId) match.categoryId = new mongoose.Types.ObjectId(categoryId);
  if (search) match.$text = { $search: search };
  return match;
}

function valueCondition(filter) {
  if (filter.range) {
    const condition = {};
    if (filter.range.min != null) condition.$gte = filter.range.min;
    if (filter.range.max != null) condition.$lte = filter.range.max;
    return condition;
  }
  return { $in: filter.values };
}

function productFilterMatch(filters) {
  const match = {};
  for (const filter of filters) {
    if (filter.source === ATTRIBUTE_SOURCE.ENTITY) match[filter.field] = valueCondition(filter);
    if (filter.source === ATTRIBUTE_SOURCE.PRODUCT) {
      match[`attributes.${filter.key}`] = valueCondition(filter);
    }
  }
  return match;
}

function variantFilterMatch(filters) {
  const match = {};
  for (const filter of filters) {
    if (filter.source === ATTRIBUTE_SOURCE.VARIANT) {
      match[`options.${filter.key}`] = valueCondition(filter);
    }
  }
  return match;
}

function matchingVariantsLookup(filters, as = "_matchingVariants", { groupByPrice = false } = {}) {
  const match = {
    $expr: { $eq: ["$productId", "$$productId"] },
    status: PRODUCT_STATUS.ACTIVE,
    deletedAt: null,
    ...variantFilterMatch(filters),
  };
  const pipeline = [{ $match: match }];
  if (groupByPrice) {
    pipeline.push({
      $group: {
        _id: null,
        min: { $min: "$sellingPrice" },
        max: { $max: "$sellingPrice" },
      },
    });
  } else {
    pipeline.push({ $limit: 1 });
  }

  return {
    $lookup: {
      from: Variant.collection.name,
      let: { productId: "$_id" },
      pipeline,
      as,
    },
  };
}

function applyFilters(filters) {
  const stages = [];
  const productMatch = productFilterMatch(filters);
  if (Object.keys(productMatch).length > 0) stages.push({ $match: productMatch });

  const hasVariantFilters = filters.some((filter) => filter.source === ATTRIBUTE_SOURCE.VARIANT);
  if (hasVariantFilters) {
    stages.push(matchingVariantsLookup(filters));
    stages.push({ $match: { "_matchingVariants.0": { $exists: true } } });
  }
  return stages;
}

function sortStage(sort, hasSearch) {
  const direction = sort.direction === "asc" ? 1 : -1;
  if (sort.field === "price") return { effectiveMinPrice: direction, _id: 1 };
  if (sort.field === "name") return { name: direction, _id: 1 };
  if (sort.field === "relevance" && hasSearch) return { _searchScore: -1, _id: 1 };
  return { createdAt: direction, _id: 1 };
}

async function listCatalog({ categoryId, search, filters, sort, pagination }) {
  const { page, limit } = pagination;
  const pipeline = [{ $match: publicMatch({ categoryId, search }) }];
  if (search) pipeline.push({ $addFields: { _searchScore: { $meta: "textScore" } } });
  pipeline.push(...applyFilters(filters));
  pipeline.push(matchingVariantsLookup([], "_priceStats", { groupByPrice: true }));
  pipeline.push({
    $addFields: {
      effectiveMinPrice: { $ifNull: ["$sellingPrice", { $arrayElemAt: ["$_priceStats.min", 0] }] },
      effectiveMaxPrice: { $ifNull: ["$sellingPrice", { $arrayElemAt: ["$_priceStats.max", 0] }] },
    },
  });
  pipeline.push({ $sort: sortStage(sort, Boolean(search)) });
  pipeline.push({
    $facet: {
      items: [
        { $skip: page * limit },
        { $limit: limit },
        { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "_category" } },
        { $lookup: { from: "brands", localField: "brandId", foreignField: "_id", as: "_brand" } },
        {
          $project: {
            _id: 1,
            name: 1,
            slug: 1,
            shortDescription: 1,
            categoryId: {
              $let: {
                vars: { category: { $arrayElemAt: ["$_category", 0] } },
                in: { id: "$$category._id", name: "$$category.name", slug: "$$category.slug" },
              },
            },
            brandId: {
              $let: {
                vars: { brand: { $arrayElemAt: ["$_brand", 0] } },
                in: { id: "$$brand._id", name: "$$brand.name", slug: "$$brand.slug", logo: "$$brand.logo" },
              },
            },
            productType: 1,
            featured: 1,
            tags: 1,
            attributes: 1,
            thumbnail: 1,
            images: 1,
            currency: 1,
            sellingPrice: 1,
            originalPrice: 1,
            stock: 1,
            pricing: {
              min: "$effectiveMinPrice",
              max: "$effectiveMaxPrice",
              currency: "$currency",
            },
            publishedAt: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ],
      total: [{ $count: "count" }],
    },
  });

  const [result] = await Product.aggregate(pipeline).collation({ locale: "en", strength: 2 });
  return {
    items: (result?.items ?? []).map((record) => {
      const item = mapCatalogRecord(record);
      if (item.categoryId?.id) item.categoryId.id = String(item.categoryId.id);
      if (item.brandId?.id) item.brandId.id = String(item.brandId.id);
      return item;
    }),
    total: result?.total?.[0]?.count ?? 0,
    page,
    limit,
  };
}

function distinctProductCounts(valuePath) {
  return [
    { $unwind: valuePath },
    { $match: { [valuePath.slice(1)]: { $ne: null } } },
    { $group: { _id: { value: valuePath, productId: "$_id" } } },
    { $group: { _id: "$_id.value", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 500 },
  ];
}

function facetPipeline(attribute, allFilters) {
  const otherFilters = allFilters.filter((filter) => filter.key !== attribute.key);
  const stages = applyFilters(otherFilters);

  if (attribute.source === ATTRIBUTE_SOURCE.VARIANT) {
    const otherVariantFilters = otherFilters.filter(
      (filter) => filter.source === ATTRIBUTE_SOURCE.VARIANT
    );
    stages.push({
      $lookup: {
        from: Variant.collection.name,
        let: { productId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$productId", "$$productId"] },
              status: PRODUCT_STATUS.ACTIVE,
              deletedAt: null,
              ...variantFilterMatch(otherVariantFilters),
            },
          },
          { $project: { value: `$options.${attribute.key}` } },
        ],
        as: "_facetVariants",
      },
    });
    stages.push({ $unwind: "$_facetVariants" });
    stages.push({ $match: { "_facetVariants.value": { $ne: null } } });
    stages.push({ $group: { _id: { value: "$_facetVariants.value", productId: "$_id" } } });
    stages.push({ $group: { _id: "$_id.value", count: { $sum: 1 } } });
    stages.push({ $sort: { count: -1, _id: 1 } }, { $limit: 500 });
    return stages;
  }

  const path = attribute.source === ATTRIBUTE_SOURCE.ENTITY
    ? `$${attribute.key}Id`
    : `$attributes.${attribute.key}`;
  stages.push(...distinctProductCounts(path));
  return stages;
}

async function catalogFacets({ categoryId, search, filters, attributes }) {
  if (attributes.length === 0) return {};
  const facets = Object.fromEntries(
    attributes.map((attribute) => [attribute.key, facetPipeline(attribute, filters)])
  );
  const [result] = await Product.aggregate([
    { $match: publicMatch({ categoryId, search }) },
    { $facet: facets },
  ]).allowDiskUse(true);
  return result ?? {};
}

module.exports = { listCatalog, catalogFacets };
