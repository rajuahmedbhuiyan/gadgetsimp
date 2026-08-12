"use strict";

const mongoose = require("mongoose");
const Product = require("./product.model");
const Variant = require("./variant.model");
const Category = require("../category/category.model");
const Attribute = require("../attribute/attribute.model");
const Brand = require("../brand/brand.model");
const ApiError = require("../../shared/ApiError");
const { withTransaction } = require("../../config/database");
const {
  ATTRIBUTE_SOURCE,
  ATTRIBUTE_TYPE,
  CATALOG_STATUS,
  PRODUCT_TYPE,
  PRODUCT_STATUS,
  PRODUCT_VISIBILITY,
} = require("../../shared/constants");
const { mapCatalogRecord } = require("../../shared/catalogSchemas");
const query = require("./product.query");

function sessionOption(session) {
  return session ? { session } : {};
}

async function categoryContext(categoryIds) {
  const uniqueIds = [...new Set(categoryIds.map(String))];
  const categories = await Category.find({ _id: { $in: uniqueIds }, deletedAt: null }).lean();
  if (categories.length !== uniqueIds.length) {
    throw ApiError.unprocessable("One or more categories do not exist", { code: "PRODUCT_CATEGORY_INVALID" });
  }

  const configuredAttributeIds = [...new Set(categories.flatMap((category) => category.attributes ?? []).map(String))];
  const attributes = await Attribute.find({ _id: { $in: configuredAttributeIds }, deletedAt: null }).lean();
  const byId = new Map(attributes.map((attribute) => [String(attribute._id), attribute]));
  const configured = configuredAttributeIds
    .map((attributeId, index) => ({
      ...byId.get(String(attributeId)),
      categoryConfiguration: {
        filterable: true,
        variantOptionAllowed: byId.get(String(attributeId))?.source === ATTRIBUTE_SOURCE.VARIANT,
        required: false,
        sortOrder: index,
      },
    }))
    .filter((attribute) => attribute.key);

  return { categories, attributes: configured, byKey: new Map(configured.map((item) => [item.key, item])) };
}

async function validateBrand(brandId) {
  if (!brandId) return;
  const exists = await Brand.exists({ _id: brandId, deletedAt: null });
  if (!exists) throw ApiError.unprocessable("Brand does not exist", { code: "PRODUCT_BRAND_INVALID" });
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function optionValues() { return new Set(); }

function validateValue(attribute, value, field) {
  const allowed = optionValues(attribute);
  if (allowed.size > 0) {
    const values = Array.isArray(value) ? value : [value];
    const invalid = values.find((candidate) => !allowed.has(String(candidate)));
    if (invalid !== undefined) {
      throw ApiError.unprocessable(`Invalid value for ${attribute.name}`, {
        code: "PRODUCT_ATTRIBUTE_VALUE_INVALID",
        errors: [{ field, message: `Value '${String(invalid)}' is not configured for this attribute` }],
      });
    }
  }

  if (attribute.type === ATTRIBUTE_TYPE.RANGE && typeof value !== "number") {
    throw ApiError.unprocessable(`${attribute.name} must be numeric`, {
      code: "PRODUCT_ATTRIBUTE_VALUE_INVALID",
      errors: [{ field, message: "Expected a number" }],
    });
  }
}

function validateProductAttributes(context, attributes, entityValues) {
  for (const [key, value] of Object.entries(attributes ?? {})) {
    const metadata = context.byKey.get(key);
    if (!metadata || metadata.source !== ATTRIBUTE_SOURCE.PRODUCT) {
      throw ApiError.unprocessable(`Attribute '${key}' is not a product attribute for this category`, {
        code: "PRODUCT_ATTRIBUTE_INVALID",
        errors: [{ field: `attributes.${key}`, message: "Attribute is not assigned to the category" }],
      });
    }
    validateValue(metadata, value, `attributes.${key}`);
  }

  for (const metadata of context.attributes) {
    if (!metadata.categoryConfiguration.required) continue;
    if (metadata.source === ATTRIBUTE_SOURCE.PRODUCT && !hasValue(attributes?.[metadata.key])) {
      throw ApiError.unprocessable(`${metadata.name} is required`, {
        code: "PRODUCT_ATTRIBUTE_REQUIRED",
        errors: [{ field: `attributes.${metadata.key}`, message: "Required by the category" }],
      });
    }
    if (metadata.source === ATTRIBUTE_SOURCE.ENTITY) {
      const field = `${metadata.key}Id`;
      if (!field || !hasValue(entityValues[field])) {
        throw ApiError.unprocessable(`${metadata.name} is required`, {
          code: "PRODUCT_ATTRIBUTE_REQUIRED",
          errors: [{ field: field ?? metadata.key, message: "Required by the category" }],
        });
      }
    }
  }
}

function validateProductType(input) {
  const type = input.productType ?? PRODUCT_TYPE.SIMPLE;
  if (type === PRODUCT_TYPE.SIMPLE && !input.sku) {
    throw ApiError.unprocessable("Simple products require a product SKU", {
      code: "SIMPLE_PRODUCT_PURCHASING_FIELDS_REQUIRED",
    });
  }
  if (type === PRODUCT_TYPE.SIMPLE && (input.variationOptions || input.variations)) {
    throw ApiError.unprocessable("Simple products cannot define variations", {
      code: "SIMPLE_PRODUCT_HAS_VARIATIONS",
    });
  }
  if (type === PRODUCT_TYPE.VARIABLE && !input.variationOptions && !input.variations) {
    throw ApiError.unprocessable("Variable products require variationOptions or variations", {
      code: "VARIATION_OPTIONS_REQUIRED",
    });
  }
  return type;
}

function variationCombinations(context, options = {}) {
  const entries = Object.entries(options);
  for (const [key, values] of entries) {
    const attribute = context.byKey.get(key);
    if (!attribute || attribute.source !== ATTRIBUTE_SOURCE.VARIANT) {
      throw ApiError.unprocessable(`Attribute '${key}' cannot generate variations for this category`, {
        code: "VARIATION_OPTION_INVALID",
      });
    }
    for (const value of values) validateValue(attribute, value, `variationOptions.${key}`);
  }
  const combinations = entries.reduce(
    (result, [key, values]) => result.flatMap((item) => values.map((value) => ({ ...item, [key]: value }))),
    [{}]
  );
  if (combinations.length > 500) {
    throw ApiError.unprocessable("Variation options produce more than 500 combinations", {
      code: "VARIATION_LIMIT_EXCEEDED",
    });
  }
  return combinations;
}

function validateSubmittedVariations(context, variations) {
  const signatures = new Set();
  for (const variation of variations) {
    variationCombinations(context, Object.fromEntries(
      Object.entries(variation.options).map(([key, value]) => [key, [value]])
    ));
    const signature = Variant.signatureFor(variation.options);
    if (signatures.has(signature)) {
      throw ApiError.unprocessable("A variation combination was submitted more than once", {
        code: "VARIATION_COMBINATION_DUPLICATE",
      });
    }
    signatures.add(signature);
  }
  return variations;
}

function skuToken(value) {
  return String(value).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
}

function withSeoDefaults(product) {
  const seo = { ...(product.seo ?? {}) };
  const summary = product.shortDescription || product.description;
  seo.title ??= product.name;
  seo.description ??= summary.slice(0, 320);
  seo.keywords = seo.keywords?.length ? seo.keywords : [...new Set(product.tags ?? [])];
  seo.canonicalUrl ??= `https://gadgetsimp.dev/products/${product.slug}`;
  seo.noIndex ??= false;
  seo.noFollow ??= false;
  seo.ogTitle ??= seo.title;
  seo.ogDescription ??= seo.description;
  seo.ogImage ??= product.thumbnail.src;
  seo.twitterTitle ??= seo.ogTitle;
  seo.twitterDescription ??= seo.ogDescription;
  seo.twitterImage ??= seo.ogImage;
  return { ...product, seo };
}

async function presentProduct(product, variations) {
  const [allCategories, brand] = await Promise.all([
    Category.find({ deletedAt: null }).select({ name: 1, slug: 1, parentId: 1 }).lean(),
    product.brandId
      ? Brand.findOne({ _id: product.brandId, deletedAt: null }).select({ name: 1, slug: 1, logo: 1 }).lean()
      : null,
  ]);
  const categoriesById = new Map(allCategories.map((category) => [String(category._id), category]));
  const categorySummary = (category) => ({ id: String(category._id), name: category.name, slug: category.slug });
  const categoryPath = (category) => {
    const path = [];
    const seen = new Set();
    let current = category;
    while (current && !seen.has(String(current._id))) {
      seen.add(String(current._id));
      path.unshift(categorySummary(current));
      current = current.parentId ? categoriesById.get(String(current.parentId)) : null;
    }
    return path;
  };
  const result = mapCatalogRecord(product);
  result.categoryIds = (product.categoryIds ?? [])
    .map((id) => categoriesById.get(String(id)))
    .filter(Boolean)
    .map((category) => ({ ...categorySummary(category), path: categoryPath(category) }));
  result.brandId = brand
    ? { id: String(brand._id), name: brand.name, slug: brand.slug, logo: brand.logo }
    : null;
  if (variations) result.variations = variations.map(mapCatalogRecord);
  return result;
}

async function create(input, actor) {
  const context = await categoryContext(input.categoryIds);
  await validateBrand(input.brandId);
  validateProductAttributes(context, input.attributes, input);
  const productType = validateProductType(input);
  const submittedVariations = input.variations
    ? validateSubmittedVariations(context, input.variations)
    : null;
  const combinations = productType === PRODUCT_TYPE.VARIABLE && !submittedVariations
    ? variationCombinations(context, input.variationOptions)
    : [];
  const { variationOptions, variations, ...productInput } = input;
  const product = withSeoDefaults(productInput);
  product.productType = productType;
  product.variantOptionKeys = variationOptions
    ? Object.keys(variationOptions)
    : [...new Set((variations ?? []).flatMap((variation) => Object.keys(variation.options)))];
  if ([PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.OUT_OF_STOCK].includes(product.status)) {
    product.publishedAt = new Date();
  }

  const productId = await withTransaction(async (session) => {
    const [created] = await Product.create(
      [{ ...product, createdBy: actor.id, updatedBy: actor.id }],
      sessionOption(session)
    );
    const variationRows = submittedVariations ?? combinations.map((options) => ({ options }));
    if (variationRows.length > 0) {
      const baseSku = skuToken(created.sku ?? created.slug);
      await Variant.insertMany(
        variationRows.map((variation, index) => ({
          ...variation,
          productId: created._id,
          sku: variation.sku ?? `${baseSku}-${Object.values(variation.options).map(skuToken).join("-")}`,
          sellingPrice: variation.sellingPrice ?? created.sellingPrice,
          originalPrice: variation.originalPrice ?? created.originalPrice,
          stock: variation.stock ?? created.stock,
          status: variation.status ?? created.status,
          sortOrder: variation.sortOrder ?? index,
          createdBy: actor.id,
          updatedBy: actor.id,
        })),
        sessionOption(session)
      );
    }
    return created._id;
  });

  return getById(productId, { publicOnly: false });
}

async function update(id, input, actor) {
  const current = await Product.findOne({ _id: id, deletedAt: null });
  if (!current) throw ApiError.notFound("Product not found");

  const categoryIds = input.categoryIds ?? current.categoryIds;
  const context = await categoryContext(categoryIds);
  const attributes = input.attributes ?? Object.fromEntries(current.attributes ?? []);
  const entityValues = { brandId: input.brandId ?? current.brandId };
  await validateBrand(entityValues.brandId);
  validateProductAttributes(context, attributes, entityValues);
  if (input.variationOptions) variationCombinations(context, input.variationOptions);

  await withTransaction(async (session) => {
    const { variationOptions, ...productInput } = input;
    const product = withSeoDefaults(productInput);
    product.publishedAt = product.status === PRODUCT_STATUS.DRAFT
      ? null
      : current.publishedAt ?? new Date();
    Object.assign(current, product, {
      variantOptionKeys: variationOptions ? Object.keys(variationOptions) : current.variantOptionKeys,
      updatedBy: actor.id,
    });
    await current.save(sessionOption(session));
  });
  return getById(id, { publicOnly: false });
}

async function getById(id, { publicOnly = true } = {}) {
  const filter = { _id: id, deletedAt: null };
  if (publicOnly) {
    filter.status = { $in: [PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.OUT_OF_STOCK] };
    filter.visibility = PRODUCT_VISIBILITY.PUBLIC;
    filter.publishedAt = { $ne: null, $lte: new Date() };
  }
  const product = await Product.findOne(filter).lean();
  if (!product) throw ApiError.notFound("Product not found");

  const variantFilter = { productId: product._id, deletedAt: null };
  if (publicOnly) variantFilter.status = { $in: [PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.OUT_OF_STOCK] };
  const variants = await Variant.find(variantFilter).sort({ sortOrder: 1, _id: 1 }).lean();
  return presentProduct(product, variants);
}

async function remove(id, actor) {
  const removed = await withTransaction(async (session) => {
    const product = await Product.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { deletedAt: new Date(), updatedBy: actor.id },
      { new: true, ...sessionOption(session) }
    );
    if (!product) throw ApiError.notFound("Product not found");
    await Variant.updateMany(
      { productId: product._id, deletedAt: null },
      { deletedAt: new Date(), updatedBy: actor.id },
      sessionOption(session)
    );
    return product;
  });
  return { id: String(removed._id) };
}

async function categoryScope(categoryId) {
  if (!categoryId) return [];
  const categories = await Category.find({ deletedAt: null }).select({ _id: 1, parentId: 1 }).lean();
  const children = new Map();
  for (const category of categories) {
    const key = category.parentId == null ? null : String(category.parentId);
    children.set(key, [...(children.get(key) ?? []), String(category._id)]);
  }
  const scope = [];
  const queue = [String(categoryId)];
  while (queue.length) {
    const id = queue.shift();
    scope.push(id);
    queue.push(...(children.get(id) ?? []));
  }
  return scope;
}

async function filterMetadata(categoryIds) {
  if (categoryIds.length === 0) return [];
  const context = await categoryContext(categoryIds);
  return context.attributes
    .filter(
      (attribute) =>
        attribute.status === CATALOG_STATUS.ACTIVE && attribute.categoryConfiguration.filterable
    )
    .sort(
      (left, right) =>
        left.categoryConfiguration.sortOrder - right.categoryConfiguration.sortOrder
    );
}

function normalizeFilters(requested, metadata) {
  const byKey = new Map(metadata.map((attribute) => [attribute.key, attribute]));
  return Object.entries(requested).map(([key, requestedValue]) => {
    const attribute = byKey.get(key);
    if (!attribute) {
      throw ApiError.unprocessable(`Filter '${key}' is not available for this category`, {
        code: "PRODUCT_FILTER_INVALID",
        errors: [{ field: `filters.${key}`, message: "Unknown or non-filterable attribute" }],
      });
    }

    const normalized = {
      key,
      source: attribute.source,
      field: `${attribute.key}Id`,
    };
    if (Array.isArray(requestedValue)) {
      normalized.values = requestedValue.map((value) => {
        if (attribute.source === ATTRIBUTE_SOURCE.ENTITY) {
          if (typeof value !== "string" || !mongoose.isObjectIdOrHexString(value)) {
            throw ApiError.unprocessable(`Filter '${key}' requires valid entity ids`, {
              code: "PRODUCT_FILTER_INVALID",
            });
          }
          return new mongoose.Types.ObjectId(value);
        }
        return value;
      });
    } else {
      if (attribute.type !== ATTRIBUTE_TYPE.RANGE) {
        throw ApiError.unprocessable(`Filter '${key}' does not accept a range`, {
          code: "PRODUCT_FILTER_INVALID",
        });
      }
      normalized.range = requestedValue;
    }
    return normalized;
  });
}

async function list(params) {
  const categoryIds = await categoryScope(params.categoryId);
  const metadata = await filterMetadata(categoryIds);
  const normalized = normalizeFilters(params.filters, metadata);
  return query.listCatalog({ ...params, categoryIds, filters: normalized });
}

function fallbackLabel(value) {
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function entityLabels(attribute, values) {
  const entity = attribute.key;
  const Model = entity === "brand" ? Brand : entity === "category" ? Category : null;
  if (!Model) return new Map();
  const records = await Model.find({ _id: { $in: values }, deletedAt: null }).select({ name: 1 }).lean();
  return new Map(records.map((record) => [String(record._id), record.name]));
}

async function filters(params) {
  if (!params.categoryId) {
    throw ApiError.unprocessable("categoryId is required to build category filters", {
      code: "CATEGORY_REQUIRED",
    });
  }
  const categoryIds = await categoryScope(params.categoryId);
  const metadata = await filterMetadata(categoryIds);
  const normalized = normalizeFilters(params.filters, metadata);
  const facetResult = await query.catalogFacets({
    categoryIds,
    search: params.search,
    filters: normalized,
    attributes: metadata,
  });

  const output = await Promise.all(
    metadata.map(async (attribute) => {
      const buckets = facetResult[attribute.key] ?? [];
      const labels =
        attribute.source === ATTRIBUTE_SOURCE.ENTITY
          ? await entityLabels(attribute, buckets.map((bucket) => bucket._id))
          : new Map();

      if (attribute.type === ATTRIBUTE_TYPE.RANGE) {
        const numeric = buckets.map((bucket) => Number(bucket._id)).filter(Number.isFinite);
        return {
          id: String(attribute._id),
          key: attribute.key,
          label: attribute.name,
          type: attribute.type,
          range: numeric.length > 0 ? { min: Math.min(...numeric), max: Math.max(...numeric) } : null,
          limits: { min: attribute.min, max: attribute.max },
          options: [],
        };
      }

      return {
        id: String(attribute._id),
        key: attribute.key,
        label: attribute.name,
        type: attribute.type,
        options: buckets.map((bucket) => {
          const value = String(bucket._id);
          return { value, label: labels.get(value) ?? fallbackLabel(value), count: bucket.count };
        }),
      };
    })
  );
  return output;
}

module.exports = { create, update, getById, remove, list, filters };
