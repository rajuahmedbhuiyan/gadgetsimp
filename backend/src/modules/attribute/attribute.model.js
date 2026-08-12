"use strict";

const mongoose = require("mongoose");
const {
  ATTRIBUTE_SOURCE_VALUES,
  ATTRIBUTE_TYPE_VALUES,
  CATALOG_STATUS,
  CATALOG_STATUS_VALUES,
} = require("../../shared/constants");
const { catalogSchemaOptions } = require("../../shared/catalogSchemas");

const attributeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 80,
      match: /^[a-z][a-z0-9_]*$/,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 120,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    description: { type: String, trim: true, maxlength: 2000 },
    source: { type: String, required: true, enum: ATTRIBUTE_SOURCE_VALUES },
    type: { type: String, required: true, enum: ATTRIBUTE_TYPE_VALUES },
    status: {
      type: String,
      enum: CATALOG_STATUS_VALUES,
      default: CATALOG_STATUS.ACTIVE,
      index: true,
    },
    min: { type: Number },
    max: { type: Number },
    display: {
      helpText: { type: String, trim: true, maxlength: 500 },
      placeholder: { type: String, trim: true, maxlength: 120 },
      showInProductDetails: { type: Boolean, default: true },
    },
    createdBy: { type: Number, ref: "User" },
    updatedBy: { type: Number, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  catalogSchemaOptions
);

attributeSchema.index({ status: 1, name: 1 });
attributeSchema.index({ source: 1, status: 1 });

attributeSchema.pre("validate", function validateRangeBounds() {
  if (this.type === "range") {
    if (this.min == null || this.max == null) {
      this.invalidate("min", "Range attributes require min and max");
    } else if (this.min > this.max) {
      this.invalidate("min", "min must not exceed max");
    }
  }
});

module.exports = mongoose.model("Attribute", attributeSchema);
