"use strict";

const mongoose = require("mongoose");
const { CURRENCY_VALUES, STOCK_STATUS, STOCK_STATUS_VALUES } = require("./constants");

const seoSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 70 },
    description: { type: String, trim: true, maxlength: 320 },
    keywords: { type: [{ type: String, trim: true, maxlength: 80 }], default: [] },
    canonicalUrl: { type: String, trim: true, maxlength: 1024 },
    noIndex: { type: Boolean, default: false },
    noFollow: { type: Boolean, default: false },
    ogTitle: { type: String, trim: true, maxlength: 95 },
    ogDescription: { type: String, trim: true, maxlength: 300 },
    ogImage: { type: String, trim: true, maxlength: 1024 },
    twitterTitle: { type: String, trim: true, maxlength: 70 },
    twitterDescription: { type: String, trim: true, maxlength: 200 },
    twitterImage: { type: String, trim: true, maxlength: 1024 },
  },
  { _id: false }
);

const mediaReferenceSchema = new mongoose.Schema(
  {
    mediaId: { type: Number, ref: "Media" },
    url: { type: String, trim: true, maxlength: 1024 },
    altText: { type: String, trim: true, maxlength: 180 },
    type: { type: String, enum: ["IMAGE", "VIDEO"], default: "IMAGE" },
    sortOrder: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const moneySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: CURRENCY_VALUES, default: "BDT" },
  },
  { _id: false }
);

const weightSchema = new mongoose.Schema(
  {
    value: { type: Number, min: 0 },
    unit: { type: String, enum: ["g", "kg", "oz", "lb"], default: "kg" },
  },
  { _id: false }
);

const dimensionsSchema = new mongoose.Schema(
  {
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    unit: { type: String, enum: ["mm", "cm", "m", "in"], default: "cm" },
  },
  { _id: false }
);

const stockSchema = new mongoose.Schema(
  {
    quantity: { type: Number, min: 0, default: 0 },
    trackInventory: { type: Boolean, default: true },
    allowBackorder: { type: Boolean, default: false },
    lowStockThreshold: { type: Number, min: 0, default: 5 },
    status: { type: String, enum: STOCK_STATUS_VALUES, default: STOCK_STATUS.IN_STOCK },
  },
  { _id: false }
);

const imageSchema = new mongoose.Schema(
  {
    alt: { type: String, trim: true, maxlength: 180, default: "" },
    src: { type: String, required: true, trim: true, maxlength: 1024 },
    id: { type: Number, min: 1 },
  },
  { _id: false }
);

function catalogJsonTransform(_doc, ret) {
  ret.id = String(ret._id);
  delete ret._id;
  delete ret.__v;
  return ret;
}

const catalogSchemaOptions = Object.freeze({
  timestamps: true,
  id: false,
  toJSON: { virtuals: true, transform: catalogJsonTransform },
  toObject: { virtuals: true },
});

function mapCatalogRecord(record) {
  if (!record) return record;
  const { _id, __v, ...rest } = record;
  return { id: String(_id), ...rest };
}

module.exports = {
  seoSchema,
  mediaReferenceSchema,
  moneySchema,
  weightSchema,
  dimensionsSchema,
  stockSchema,
  imageSchema,
  catalogSchemaOptions,
  catalogJsonTransform,
  mapCatalogRecord,
};
