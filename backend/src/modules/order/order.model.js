"use strict";

const mongoose = require("mongoose");
const { nextSequence } = require("../../shared/sequence");
const {
  ORDER,
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  PAYMENT_METHOD,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS,
  PAYMENT_STATUS_VALUES,
  CURRENCY_VALUES,
} = require("../../shared/constants");

/**
 * An order line, and the one place in this codebase that **copies** catalog
 * data instead of referencing it.
 *
 * The cart does the opposite - it stores intent and re-reads prices on every
 * request, so it can never quote a stale figure. An order needs the reverse
 * guarantee: it is a record of an agreement made at a moment in time, and if
 * the product's price changes tomorrow the order must still say what was
 * actually agreed. Referencing the product would silently rewrite history,
 * and the first time anyone noticed would be a customer disputing a total
 * that no longer matches their receipt.
 *
 * So the name, price, SKU and chosen options are all frozen here. `productId`
 * and `variantId` survive only as links for reporting and reordering - never
 * as a source of price.
 */
const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: "Variant", default: null },

    // Frozen catalog copy.
    name: { type: String, required: true, trim: true, maxlength: 240 },
    slug: { type: String, trim: true, maxlength: 240 },
    sku: { type: String, trim: true, maxlength: 120 },
    thumbnail: { type: String, trim: true, maxlength: 1024 },

    /**
     * The variant's options as chosen, e.g. `{ color: "black", size: "m" }`,
     * plus a rendered label. Copied rather than joined so a packing slip
     * printed a year later still says "black / m" even if that variant has
     * since been deleted.
     */
    variantOptions: { type: Map, of: String, default: undefined },
    variantLabel: { type: String, trim: true, maxlength: 240, default: null },

    unitPrice: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0, default: null },
    quantity: { type: Number, required: true, min: 1, max: ORDER.MAX_QUANTITY_PER_ITEM },
    lineTotal: { type: Number, required: true, min: 0 },

    /**
     * How many units were actually taken out of inventory for this line - 0
     * when the product does not track stock.
     *
     * Recorded rather than recomputed on cancellation, because by then the
     * product may have had inventory tracking switched on or off, and putting
     * back a number derived from today's settings would invent units that
     * were never reserved.
     */
    reservedQuantity: { type: Number, min: 0, default: 0 },
  },
  { _id: true }
);

/**
 * Where it goes. Structured rather than one free-text blob, because a courier
 * integration needs the city and postcode as fields, and splitting a blob
 * apart later is guesswork.
 */
const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true, trim: true, maxlength: 240 },
    line2: { type: String, trim: true, maxlength: 240 },
    area: { type: String, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 120 },
    district: { type: String, trim: true, maxlength: 120 },
    postalCode: { type: String, trim: true, maxlength: 24 },
    country: { type: String, trim: true, maxlength: 80, default: "Bangladesh" },
  },
  { _id: false }
);

/**
 * Every status change, appended and never rewritten.
 *
 * An order carries its current status for querying, but the history is what
 * answers the questions that actually get asked - who cancelled this, when,
 * and what did they say about it. Overwriting a status field alone destroys
 * that, and it is exactly the information wanted during a dispute.
 */
const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUS_VALUES, required: true },
    // Required by the service for negative outcomes; optional in the schema
    // because the very first PENDING event has nothing to explain.
    note: { type: String, trim: true, maxlength: ORDER.MAX_NOTE_LENGTH },
    changedBy: { type: Number, ref: "User", default: null },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * What the order was placed from.
 *
 * Evidence, not identity: every field here is client-supplied or derived from
 * client-supplied text, and none of it authorises anything. It exists so
 * support can make sense of a complaint and so a pattern of fraudulent orders
 * has something to correlate on.
 */
const clientInfoSchema = new mongoose.Schema(
  {
    ip: { type: String, maxlength: 64, default: null },
    userAgent: { type: String, maxlength: 512, default: null },
    os: { type: String, maxlength: 60, default: null },
    browser: { type: String, maxlength: 60, default: null },
    device: { type: String, maxlength: 20, default: null },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    // Integer primary key from the shared sequence, matching users and media.
    _id: { type: Number },

    /**
     * The number a customer quotes on the phone. Six digits, random, unique -
     * see `ORDER` in constants for why it is not the sequence.
     *
     * Guessable by design, so it authorises nothing: every read is scoped by
     * owner or by staff role, never by knowing this.
     */
    orderNumber: { type: String, required: true, unique: true, trim: true, maxlength: 12 },

    /**
     * Null for a guest checkout. Set later if that guest completes the
     * account creation the checkout offered them, which is what makes their
     * order appear in "my orders" the first time they sign in.
     */
    userId: { type: Number, ref: "User", default: null, index: true },

    /**
     * Kept independently of `userId` because a guest order has no user to
     * read it from, and because it is the address the receipt was sent to -
     * which should not change if the account's email is later edited.
     */
    email: { type: String, lowercase: true, trim: true, maxlength: 160, default: null },

    contact: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      phone: { type: String, required: true, trim: true, maxlength: 32 },
    },

    shippingAddress: { type: addressSchema, required: true },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: "An order must contain at least one item",
      },
    },

    /**
     * Money. Every one of these is computed server-side from the catalog and
     * written here; none is ever accepted from a request. The validator that
     * feeds this model is `.strict()` and has no price fields at all, so a
     * client that tries to send one is rejected rather than ignored.
     */
    currency: { type: String, enum: CURRENCY_VALUES, default: "BDT" },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    shippingFee: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },

    paymentMethod: {
      type: String,
      enum: PAYMENT_METHOD_VALUES,
      required: true,
      default: PAYMENT_METHOD.CASH_ON_DELIVERY,
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUS_VALUES,
      default: PAYMENT_STATUS.DUE,
    },

    status: {
      type: String,
      enum: ORDER_STATUS_VALUES,
      default: ORDER_STATUS.PENDING,
      index: true,
    },

    // The customer's delivery instruction, set at checkout and editable by
    // staff. Distinct from the notes on `statusHistory`, which explain a
    // status change and belong to whoever made it.
    note: { type: String, trim: true, maxlength: ORDER.MAX_NOTE_LENGTH, default: null },

    statusHistory: { type: [statusEventSchema], default: [] },

    client: { type: clientInfoSchema, default: () => ({}) },

    /**
     * Whether the reserved units have been given back. A flag rather than
     * inferring it from the status, because an order can reach CANCELED only
     * once but the code path could run twice under a retry - and restocking
     * twice invents inventory that does not exist.
     */
    stockReleased: { type: Boolean, default: false },

    /**
     * Double-submit guard, and **namespaced by the person placing the order**
     * (`"<userId|email|ip>:<key>"`) before it is stored.
     *
     * The namespace is the security part. A bare client-chosen key on a unique
     * index would let anyone guess a key someone else used and be handed that
     * person's order back as the "already placed" response - an order-disclosure
     * hole hiding inside a convenience feature. Scoping it to the caller means
     * two people cannot collide by accident or on purpose.
     */
    idempotencyKey: { type: String, default: null, maxlength: 200, select: false },

    placedAt: { type: Date, default: Date.now },
    updatedBy: { type: Number, ref: "User", default: null },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    id: false,
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

orderSchema.virtual("id").get(function id() {
  return this._id;
});

// The three listings that exist: a customer's own orders newest-first, the
// admin queue filtered by status, and the admin list by date. Equality field
// before the sort field in each.
orderSchema.index({ userId: 1, placedAt: -1 });
orderSchema.index({ status: 1, placedAt: -1 });
orderSchema.index({ placedAt: -1 });
// Guest orders are claimed by email when their account is finally created.
orderSchema.index({ email: 1, placedAt: -1 });
orderSchema.index({ "contact.phone": 1 });
// Partial, so the many orders placed without a key do not all collide on null.
orderSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

orderSchema.pre("save", async function assignId() {
  if (this.isNew && this._id == null) {
    this._id = await nextSequence("order");
  }
});

module.exports = mongoose.model("Order", orderSchema);
