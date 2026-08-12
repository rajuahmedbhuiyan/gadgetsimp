"use strict";

const mongoose = require("mongoose");
const slugify = require("slugify");
const { PRODUCT_STATUS, PRODUCT_STATUS_VALUES, CURRENCY } = require("../../shared/constants");

/**
 * All prices are integer minor units (poisha). 1999.99 BDT is stored as
 * 199999. Floats accumulate error the moment you sum line totals or apply a
 * percentage discount, and "the invoice is off by one poisha" is not a bug
 * anyone wants to chase.
 */
const priceField = {
  type: Number,
  required: true,
  min: [0, "Price cannot be negative"],
  validate: {
    validator: Number.isInteger,
    message: "Price must be an integer amount in minor units (poisha)",
  },
};

/**
 * The struck-through "was" price. A compareAtPrice that is not actually
 * higher than the live price is a dark pattern - and unlawful in several
 * markets - so it is rejected rather than quietly rendered.
 */
const compareAtPriceField = {
  type: Number,
  min: 0,
  default: null,
  validate: {
    validator(value) {
      return value == null || value > this.price;
    },
    message: "compareAtPrice must be greater than the current price",
  },
};

const variantSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 64 },
    // e.g. { Colour: 'Midnight', Storage: '256GB' }
    attributes: { type: Map, of: String, default: () => new Map() },
    price: priceField,
    compareAtPrice: compareAtPriceField,
    stock: { type: Number, required: true, min: 0, default: 0 },
    imageUrl: { type: String, trim: true, maxlength: 512 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Product title is required"],
      trim: true,
      minlength: 3,
      maxlength: 180,
    },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 5000 },
    // Short marketing line for cards and search results.
    summary: { type: String, trim: true, maxlength: 300 },

    brand: { type: String, trim: true, maxlength: 80, index: true },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Product must belong to a category"],
      index: true,
    },

    // Denormalised from the category tree so a listing filtered by an
    // ancestor is one indexed prefix match instead of a join plus a tree walk.
    categoryPath: { type: String, default: "", index: true },

    price: priceField,
    compareAtPrice: compareAtPriceField,
    currency: { type: String, default: CURRENCY.CODE, uppercase: true, maxlength: 3 },

    stock: { type: Number, required: true, min: 0, default: 0 },
    lowStockThreshold: { type: Number, min: 0, default: 5 },

    sku: { type: String, trim: true, uppercase: true, maxlength: 64, unique: true, sparse: true },

    images: {
      type: [
        {
          _id: false,
          url: { type: String, required: true, trim: true, maxlength: 512 },
          alt: { type: String, trim: true, maxlength: 160 },
        },
      ],
      default: [],
    },

    variants: { type: [variantSchema], default: [] },

    attributes: { type: Map, of: String, default: () => new Map() },
    tags: { type: [String], default: [], index: true },

    status: {
      type: String,
      enum: PRODUCT_STATUS_VALUES,
      default: PRODUCT_STATUS.DRAFT,
      index: true,
    },
    isFeatured: { type: Boolean, default: false },

    // Maintained by the review module when it lands; never client-writable.
    ratingAverage: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },

    soldCount: { type: Number, min: 0, default: 0 },

    // Users are keyed by integer, so the reference is a Number, not ObjectId.
    createdBy: { type: Number, ref: "User" },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        delete ret._id;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

/**
 * Index strategy, one per real access pattern:
 *
 *  - text index  : the search bar. Weighted so a title hit outranks a
 *                  description hit for the same term.
 *  - category+status+createdAt : the default "browse a category" listing,
 *                  which filters on the first two and sorts on the third.
 *                  Order matters - equality fields first, then the sort field.
 *  - status+price : price-sorted and price-filtered browsing.
 *  - categoryPath : subtree browsing via prefix match.
 */
productSchema.index(
  { title: "text", description: "text", brand: "text", tags: "text" },
  { weights: { title: 10, brand: 5, tags: 3, description: 1 }, name: "product_text_search" }
);
productSchema.index({ category: 1, status: 1, createdAt: -1 });
productSchema.index({ status: 1, price: 1 });
productSchema.index({ categoryPath: 1, status: 1 });
productSchema.index({ status: 1, isFeatured: -1, soldCount: -1 });
// `slug` and `sku` carry their unique indexes on the field definitions.

// Mongoose 9 middleware takes no `next` callback - returning is completion.
productSchema.pre("validate", function generateSlug() {
  if (this.isModified("title") && !this.isModified("slug")) {
    this.slug = slugify(this.title, { lower: true, strict: true, trim: true });
  }
});


productSchema.virtual("inStock").get(function inStock() {
  return this.totalStock > 0;
});

// With variants, the sellable quantity is the sum of the active ones; the
// top-level `stock` field only applies to simple products.
productSchema.virtual("totalStock").get(function totalStock() {
  if (this.variants?.length > 0) {
    return this.variants
      .filter((variant) => variant.isActive)
      .reduce((sum, variant) => sum + variant.stock, 0);
  }
  return this.stock;
});

productSchema.virtual("isLowStock").get(function isLowStock() {
  return this.totalStock > 0 && this.totalStock <= this.lowStockThreshold;
});

productSchema.virtual("discountPercent").get(function discountPercent() {
  if (!this.compareAtPrice || this.compareAtPrice <= this.price) return 0;
  return Math.round(((this.compareAtPrice - this.price) / this.compareAtPrice) * 100);
});

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
