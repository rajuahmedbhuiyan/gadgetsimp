"use strict";

const mongoose = require("mongoose");

/**
 * A saved product.
 *
 * **One row per entry, not one document per user** - the opposite of the cart,
 * and worth explaining because the inconsistency is deliberate.
 *
 * A cart is bounded (a hundred lines is already unreasonable), always read
 * whole, and mutated as a unit - which is exactly what a single document with
 * an embedded array is for. A wishlist is the reverse: it grows over months,
 * is read a page at a time, is sorted and filtered against product data, and
 * has no operation that needs all of it at once except the id list. Paginating
 * inside an embedded array means loading the whole array to return twenty of
 * it.
 *
 * The compound unique index below then does real work: adding something twice
 * is a no-op enforced by the database rather than a read-then-write in
 * application code that two concurrent taps could both pass.
 *
 * No variant. A wishlist records "I want this thing", and a shopper who saved
 * a t-shirt has not committed to a size - that choice belongs on the product
 * page when they actually buy. Storing one would mean a saved item silently
 * disappearing when that particular SKU was discontinued, even though the
 * product is still on sale.
 */
const wishlistSchema = new mongoose.Schema(
  {
    userId: { type: Number, ref: "User", required: true },

    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },

    /**
     * Separate from `createdAt` even though they start equal, because this is
     * the field the default sort reads and a sort key should not be something
     * a future `timestamps` change can move.
     */
    addedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    id: false,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

/**
 * Saving the same product twice is not an error, it is a no-op - and this is
 * what makes it one. The service relies on it for an idempotent add rather
 * than checking first and inserting after, which two concurrent taps on the
 * same heart icon would both sail through.
 */
wishlistSchema.index({ userId: 1, productId: 1 }, { unique: true });

// The listing: one user's saved items, newest first.
wishlistSchema.index({ userId: 1, addedAt: -1 });

module.exports = mongoose.model("Wishlist", wishlistSchema);
