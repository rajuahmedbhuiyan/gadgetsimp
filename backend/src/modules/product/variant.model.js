"use strict";

const mongoose = require("mongoose");
const { PRODUCT_STATUS, PRODUCT_STATUS_VALUES } = require("../../shared/constants");
const {
  stockSchema,
  weightSchema,
  dimensionsSchema,
  catalogSchemaOptions,
  imageSchema,
} = require("../../shared/catalogSchemas");

function signatureFor(options) {
  const entries = options instanceof Map ? [...options.entries()] : Object.entries(options ?? {});
  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join("|");
}

const variantSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 120 },
    barcode: { type: String, trim: true, maxlength: 120 },
    options: {
      type: Map,
      of: { type: String, trim: true, maxlength: 120 },
      required: true,
    },
    optionsSignature: { type: String, required: true, maxlength: 1000, select: false },
    sellingPrice: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0 },
    stock: { type: stockSchema, default: () => ({}) },
    status: { type: String, enum: PRODUCT_STATUS_VALUES, default: PRODUCT_STATUS.ACTIVE },
    image: imageSchema,
    weight: weightSchema,
    dimensions: dimensionsSchema,
    sortOrder: { type: Number, min: 0, default: 0 },
    createdBy: { type: Number, ref: "User" },
    updatedBy: { type: Number, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  catalogSchemaOptions
);

variantSchema.index({ productId: 1, status: 1, sortOrder: 1 });
variantSchema.index({ productId: 1, optionsSignature: 1 }, { unique: true });
variantSchema.index({ productId: 1, sellingPrice: 1 });
variantSchema.index({ "options.$**": 1 });

variantSchema.pre("validate", function setSignature() {
  this.optionsSignature = signatureFor(this.options);
  if (this.originalPrice != null && this.originalPrice < this.sellingPrice) {
    this.invalidate("originalPrice", "originalPrice must not be less than sellingPrice");
  }
});

const Variant = mongoose.model("Variant", variantSchema);

module.exports = Variant;
module.exports.signatureFor = signatureFor;
