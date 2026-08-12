"use strict";

const mongoose = require("mongoose");
const slugify = require("slugify");

/**
 * Category tree.
 *
 * Modelled as parent pointer + materialised `path`. The parent pointer alone
 * would make "every product under Electronics, including all descendants"
 * an N-query recursive walk; storing the ancestor chain in `path` turns it
 * into one indexed prefix match. The cost is that moving a subtree has to
 * rewrite its descendants' paths, which is rare in a catalog and handled in
 * the service.
 *
 * Example: `/electronics/laptops/gaming`
 */
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    imageUrl: { type: String, trim: true, maxlength: 512 },

    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    path: { type: String, default: "", index: true },
    depth: { type: Number, default: 0, min: 0, max: 4 },

    isActive: { type: Boolean, default: true },
    // Manual merchandising order; ties break by name.
    displayOrder: { type: Number, default: 0 },
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

// `slug` already carries `unique: true` on the field definition.
categorySchema.index({ path: 1, isActive: 1 });
categorySchema.index({ parent: 1, displayOrder: 1 });

// Sibling names must be unique, but "Accessories" may legitimately exist
// under both Laptops and Phones - hence the compound index rather than a
// unique constraint on `name` alone.
categorySchema.index({ parent: 1, name: 1 }, { unique: true });

// Mongoose 9 middleware takes no `next` callback - returning is completion.
categorySchema.pre("validate", function generateSlug() {
  if (this.isModified("name") && !this.isModified("slug")) {
    this.slug = slugify(this.name, { lower: true, strict: true, trim: true });
  }
});

categorySchema.virtual("children", {
  ref: "Category",
  localField: "_id",
  foreignField: "parent",
});

const Category = mongoose.model("Category", categorySchema);

module.exports = Category;
