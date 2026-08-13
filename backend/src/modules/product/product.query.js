"use strict";

const mongoose = require("mongoose");
const Product = require("./product.model");
const Variant = require("./variant.model");
const { ATTRIBUTE_SOURCE, PRODUCT_STATUS, PRODUCT_VISIBILITY } = require("../../shared/constants");
const { mapCatalogRecord } = require("../../shared/catalogSchemas");

/**
 * The gate every public catalog read passes through.
 *
 * `publishedAt: { $lte: now }` is what makes a product genuinely public:
 * ACTIVE alone is not enough, because the field is stamped on the first
 * transition to ACTIVE and a product must never appear before it.
 *
 * The static filters live here rather than in the dynamic attribute machinery
 * because they are properties of the product document itself - indexable, and
 * meaningful for every category - whereas attribute filters are category
 * configuration that has to be resolved first. Price is the exception and is
 * applied later; see `listCatalog`.
 */
function publicMatch({ categoryIds, search, featured, inStock, brandIds }) {
  const match = {
    status: { $in: [PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.OUT_OF_STOCK] },
    visibility: PRODUCT_VISIBILITY.PUBLIC,
    deletedAt: null,
    publishedAt: { $ne: null, $lte: new Date() },
  };
  if (categoryIds?.length) match.categoryIds = { $in: categoryIds.map((id) => new mongoose.Types.ObjectId(id)) };
  if (search) match.$text = { $search: search };
  if (featured != null) match.featured = featured;
  if (brandIds?.length) match.brandId = { $in: brandIds.map((id) => new mongoose.Types.ObjectId(id)) };

  if (inStock === true) {
    // Buyable means: not flagged out of stock, and either inventory is not
    // tracked, or there is some, or backorders are accepted.
    match.status = PRODUCT_STATUS.ACTIVE;
    match.$or = [
      { "stock.trackInventory": false },
      { "stock.quantity": { $gt: 0 } },
      { "stock.allowBackorder": true },
    ];
  }

  if (inStock === false) {
    match.$or = [
      { status: PRODUCT_STATUS.OUT_OF_STOCK },
      { "stock.trackInventory": true, "stock.quantity": { $lte: 0 }, "stock.allowBackorder": false },
    ];
  }

  return match;
}

/**
 * The same gate as `publicMatch()`, written as an aggregation **expression**
 * instead of a query.
 *
 * Two forms of one rule, deliberately kept adjacent. A pipeline that has
 * already `$lookup`-ed a product cannot re-apply `publicMatch` as a `$match`
 * without dropping the row entirely - but the wishlist needs to *keep* a row
 * whose product was withdrawn and merely flag it, exactly as the cart does. So
 * it needs the rule as a boolean it can compute.
 *
 * They must change together; if you edit one, edit the other. A missing
 * product evaluates to `false` here rather than throwing, which is what makes
 * a hard-deleted product read as unavailable instead of breaking the page.
 */
function publicVisibilityExpr() {
  return {
    $and: [
      { $in: ["$status", [PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.OUT_OF_STOCK]] },
      { $eq: ["$visibility", PRODUCT_VISIBILITY.PUBLIC] },
      { $eq: [{ $ifNull: ["$deletedAt", null] }, null] },
      { $ne: [{ $ifNull: ["$publishedAt", null] }, null] },
      { $lte: [{ $ifNull: ["$publishedAt", new Date(8640000000000000)] }, "$$NOW"] },
    ],
  };
}

/**
 * The same gate for a variant: sellable states only, not soft-deleted.
 *
 * Extracted so the `$lookup` below and the cart - which has to decide whether
 * a SKU someone chose last week is still buyable - read the rule from one
 * place. A variant with no `publishedAt` of its own inherits its product's,
 * which the caller is expected to have already checked.
 */
function variantPublicMatch() {
  return {
    status: { $in: [PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.OUT_OF_STOCK] },
    deletedAt: null,
  };
}

/**
 * The trimmed shape a storefront grid actually renders.
 *
 * A product document carries descriptions, attribute maps, galleries and SEO -
 * none of which a card shows, and all of which travel over the wire and
 * through JSON.parse on a phone. Projecting in the database keeps a 24-item
 * page small.
 */
const CARD_PROJECTION = {
  _id: 1,
  name: 1,
  slug: 1,
  thumbnail: 1,
  productType: 1,
  featured: 1,
  currency: 1,
  sellingPrice: 1,
  originalPrice: 1,
  status: 1,
  brandId: {
    $let: {
      vars: { brand: { $arrayElemAt: ["$_brand", 0] } },
      in: { id: "$$brand._id", name: "$$brand.name", slug: "$$brand.slug" },
    },
  },
  pricing: { min: "$effectiveMinPrice", max: "$effectiveMaxPrice", currency: "$currency" },
  inStock: {
    $and: [
      { $ne: ["$status", PRODUCT_STATUS.OUT_OF_STOCK] },
      {
        $or: [
          { $eq: ["$stock.trackInventory", false] },
          { $gt: ["$stock.quantity", 0] },
          { $eq: ["$stock.allowBackorder", true] },
        ],
      },
    ],
  },
  discountPercent: {
    $cond: [
      { $and: [{ $gt: ["$originalPrice", 0] }, { $gt: ["$originalPrice", "$sellingPrice"] }] },
      {
        $round: [
          { $multiply: [{ $divide: [{ $subtract: ["$originalPrice", "$sellingPrice"] }, "$originalPrice"] }, 100] },
          0,
        ],
      },
      0,
    ],
  },
};

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
    ...variantPublicMatch(),
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

/**
 * @param {object} params
 * @param {"full"|"card"} [params.projection] `card` returns the lightweight
 *   storefront shape; `full` the richer admin/detail one.
 */
async function listCatalog({
  categoryIds,
  search,
  filters,
  sort,
  pagination,
  featured,
  inStock,
  brandIds,
  price,
  projection = "full",
}) {
  const { page, limit } = pagination;
  const pipeline = [{ $match: publicMatch({ categoryIds, search, featured, inStock, brandIds }) }];
  if (search) pipeline.push({ $addFields: { _searchScore: { $meta: "textScore" } } });
  pipeline.push(...applyFilters(filters));
  pipeline.push(matchingVariantsLookup([], "_priceStats", { groupByPrice: true }));
  pipeline.push({
    $addFields: {
      effectiveMinPrice: { $ifNull: ["$sellingPrice", { $arrayElemAt: ["$_priceStats.min", 0] }] },
      effectiveMaxPrice: { $ifNull: ["$sellingPrice", { $arrayElemAt: ["$_priceStats.max", 0] }] },
    },
  });
  // Price filters run here, not in `publicMatch`: a variable product has no
  // single price of its own, so the value being filtered is the effective
  // range just computed from its variants.
  if (price && (price.min != null || price.max != null)) {
    const condition = {};
    if (price.min != null) condition.$gte = price.min;
    if (price.max != null) condition.$lte = price.max;
    pipeline.push({ $match: { effectiveMinPrice: condition } });
  }

  pipeline.push({ $sort: sortStage(sort, Boolean(search)) });
  pipeline.push({
    $facet: {
      items: [
        { $skip: page * limit },
        { $limit: limit },
        { $lookup: { from: "categories", localField: "categoryIds", foreignField: "_id", as: "_categories" } },
        { $lookup: { from: "brands", localField: "brandId", foreignField: "_id", as: "_brand" } },
        {
          $project: projection === "card" ? CARD_PROJECTION : {
            _id: 1,
            name: 1,
            slug: 1,
            shortDescription: 1,
            categoryIds: {
              $map: {
                input: "$_categories",
                as: "category",
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
      // Only stringify what the projection actually returned - the card shape
      // has no categories, and defaulting would add an empty array to every
      // storefront row for nothing.
      if (item.categoryIds) {
        item.categoryIds = item.categoryIds.map((category) => ({ ...category, id: String(category.id) }));
      }
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
              ...variantPublicMatch(),
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

async function catalogFacets({ categoryIds, search, filters, attributes }) {
  if (attributes.length === 0) return {};
  const facets = Object.fromEntries(
    attributes.map((attribute) => [attribute.key, facetPipeline(attribute, filters)])
  );
  const [result] = await Product.aggregate([
    { $match: publicMatch({ categoryIds, search }) },
    { $facet: facets },
  ]).allowDiskUse(true);
  return result ?? {};
}

/**
 * The variant price roll-up, as a standalone stage.
 *
 * A variable product has no price of its own worth showing - its range comes
 * from its variants - so anything rendering a card needs this. Exported so the
 * wishlist builds the same `pricing` block as the storefront rather than
 * inventing a second answer to "what does this cost".
 */
function priceStatsLookup(as = "_priceStats") {
  return matchingVariantsLookup([], as, { groupByPrice: true });
}

module.exports = {
  listCatalog,
  catalogFacets,
  publicMatch,
  variantPublicMatch,
  publicVisibilityExpr,
  priceStatsLookup,
  CARD_PROJECTION,
};
