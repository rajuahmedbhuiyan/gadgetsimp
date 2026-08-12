"use strict";

const mongoose = require("mongoose");
const {
  CATALOG_STATUS,
  CATALOG_STATUS_VALUES,
  VISIBILITY,
  VISIBILITY_VALUES,
} = require("../../shared/constants");
const {
  seoSchema,
  catalogSchemaOptions,
} = require("../../shared/catalogSchemas");

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 180,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    description: { type: String, trim: true, maxlength: 10_000 },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    status: {
      type: String,
      enum: CATALOG_STATUS_VALUES,
      default: CATALOG_STATUS.DRAFT,
      index: true,
    },
    visibility: {
      type: String,
      enum: VISIBILITY_VALUES,
      default: VISIBILITY.PUBLIC,
      index: true,
    },
    image: { type: String, trim: true, maxlength: 1024 },
    /**
     * Merchandising flag: whether this category is offered for the home page.
     *
     * Curation only - it says "eligible", not "shown". `POST /shop/categories`
     * still hides an eligible category that has nothing to sell, because a
     * tile leading to an empty grid is worse than one tile fewer.
     */
    showInHome: { type: Boolean, default: false, index: true },
    attributes: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Attribute" }],
      default: [],
    },
    seo: seoSchema,
    sortOrder: { type: Number, min: 0, default: 0 },
    createdBy: { type: Number, ref: "User" },
    updatedBy: { type: Number, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  catalogSchemaOptions
);

categorySchema.index({ parentId: 1, status: 1, sortOrder: 1 });
categorySchema.index({ status: 1, visibility: 1, sortOrder: 1 });
// The home-page query: eligible categories in merchandising order.
categorySchema.index({ showInHome: 1, status: 1, sortOrder: 1 });

module.exports = mongoose.model("Category", categorySchema);
