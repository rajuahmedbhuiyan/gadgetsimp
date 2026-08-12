"use strict";

const mongoose = require("mongoose");
const { CART } = require("../../shared/constants");

/**
 * One cart per user, holding intent only.
 *
 * The line stores **what** was chosen and **how many** - never the price. A
 * price copied into the cart at add time is a price that goes stale the moment
 * the catalog changes, and a cart that quietly charges yesterday's number is
 * either a loss or a complaint depending on which way it moved. Prices are
 * resolved from the product and variant on every read, which costs one indexed
 * lookup and is always right.
 *
 * `priceAtAdd` is the one exception, and it is deliberately not used for
 * money: it is the value the shopper saw when they added the line, kept purely
 * so the response can say "this got more expensive since you added it". Nothing
 * totals it.
 */
const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },

    /**
     * The specific purchasable SKU, or null for a SIMPLE product that has no
     * variants. This is the field that makes "black, size M" a different line
     * from "white, size L" of the same product - without it a cart can only
     * express "one t-shirt" and the warehouse has to guess.
     *
     * Required for VARIABLE products and refused for SIMPLE ones; the service
     * enforces both, because the schema cannot see the product from here.
     */
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: "Variant", default: null },

    quantity: { type: Number, required: true, min: 1, max: CART.MAX_QUANTITY_PER_LINE },

    // Display-only, see above.
    priceAtAdd: { type: Number, min: 0 },

    addedAt: { type: Date, default: Date.now },
  },
  // `_id` is kept on purpose: it is the stable line handle the batch update
  // and remove endpoints address, so a client never has to reconstruct a
  // (productId, variantId) tuple to change a row it is already rendering.
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    /**
     * Integer, matching the user key. Unique because a second cart for the
     * same person is not a feature, it is a bug that splits their basket -
     * the index is what makes the upsert in the service safe under a race
     * rather than merely likely to work.
     *
     * The cart is keyed by a `userId` field rather than reusing it as `_id`
     * so a guest cart, keyed by session instead, can be added later without
     * rewriting the collection.
     */
    userId: { type: Number, ref: "User", required: true, unique: true },

    items: { type: [cartItemSchema], default: [] },
  },
  {
    timestamps: true,

    /**
     * Version checking on save, and the reason this collection has it when no
     * other does: a cart is the one document a single user writes to from
     * several places at once. Two tabs, or a double-tapped "add to cart", both
     * read `quantity: 1` and both write `quantity: 2`, and one increment
     * silently disappears. With this, the second write fails on the stale
     * version and the service retries against fresh state.
     */
    optimisticConcurrency: true,

    id: false,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model("Cart", cartSchema);
