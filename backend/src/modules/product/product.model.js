"use strict";

const mongoose = require("mongoose");
const {
  PRODUCT_STATUS,
  PRODUCT_STATUS_VALUES,
  PRODUCT_VISIBILITY,
  PRODUCT_VISIBILITY_VALUES,
  PRODUCT_TYPE,
  PRODUCT_TYPE_VALUES,
} = require("../../shared/constants");
const {
  seoSchema,
  stockSchema,
  weightSchema,
  dimensionsSchema,
  imageSchema,
  catalogSchemaOptions,
} = require("../../shared/catalogSchemas");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 240 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 240,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    description: { type: String, required: true, trim: true, maxlength: 100_000 },
    shortDescription: { type: String, trim: true, maxlength: 600 },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
    productType: { type: String, enum: PRODUCT_TYPE_VALUES, default: PRODUCT_TYPE.VARIABLE },
    sku: { type: String, unique: true, sparse: true, uppercase: true, trim: true, maxlength: 120 },
    status: { type: String, enum: PRODUCT_STATUS_VALUES, default: PRODUCT_STATUS.DRAFT },
    visibility: { type: String, enum: PRODUCT_VISIBILITY_VALUES, default: PRODUCT_VISIBILITY.PUBLIC },
    featured: { type: Boolean, default: false },
    tags: { type: [{ type: String, trim: true, lowercase: true, maxlength: 80 }], default: [] },
    attributes: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    variantOptionKeys: { type: [{ type: String, trim: true, lowercase: true }], default: [] },
    currency: { type: String, enum: ["BDT"], default: "BDT" },
    sellingPrice: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0 },
    stock: { type: stockSchema, default: () => ({}) },
    shipping: {
      requiresShipping: { type: Boolean, default: true },
      freeShipping: { type: Boolean, default: false },
      weight: weightSchema,
      dimensions: dimensionsSchema,
    },
    thumbnail: { type: imageSchema, required: true },
    images: { type: [imageSchema], default: [] },
    seo: seoSchema,
    publishedAt: { type: Date, default: null },
    createdBy: { type: Number, ref: "User" },
    updatedBy: { type: Number, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  catalogSchemaOptions
);

productSchema.index({ categoryId: 1, status: 1, visibility: 1, publishedAt: -1, createdAt: -1 });
productSchema.index({ categoryId: 1, brandId: 1, status: 1, createdAt: -1 });
productSchema.index({ status: 1, featured: 1, createdAt: -1 });
productSchema.index({ sellingPrice: 1, status: 1 });
productSchema.index({ "attributes.$**": 1 });
productSchema.index(
  { name: "text", shortDescription: "text", description: "text", tags: "text" },
  { weights: { name: 10, tags: 5, shortDescription: 3, description: 1 }, name: "product_search" }
);

productSchema.pre("validate", function validatePrices() {
  if (this.originalPrice != null && this.originalPrice < this.sellingPrice) {
    this.invalidate("originalPrice", "originalPrice must not be less than sellingPrice");
  }
});

module.exports = mongoose.model("Product", productSchema);
