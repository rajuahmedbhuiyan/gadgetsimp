"use strict";

const mongoose = require("mongoose");
const {
  CATALOG_STATUS,
  CATALOG_STATUS_VALUES,
  VISIBILITY,
  VISIBILITY_VALUES,
} = require("../../shared/constants");
const { seoSchema, catalogSchemaOptions } = require("../../shared/catalogSchemas");

const brandSchema = new mongoose.Schema(
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
    logo: { type: String, trim: true, maxlength: 1024 },
    website: { type: String, trim: true, maxlength: 1024 },
    status: { type: String, enum: CATALOG_STATUS_VALUES, default: CATALOG_STATUS.DRAFT, index: true },
    visibility: { type: String, enum: VISIBILITY_VALUES, default: VISIBILITY.PUBLIC, index: true },
    seo: seoSchema,
    publishedAt: { type: Date, default: null },
    createdBy: { type: Number, ref: "User" },
    updatedBy: { type: Number, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  catalogSchemaOptions
);

brandSchema.index({ status: 1, visibility: 1, name: 1 });

module.exports = mongoose.model("Brand", brandSchema);
