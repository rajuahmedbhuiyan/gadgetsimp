"use strict";

const crypto = require("node:crypto");
const Order = require("./order.model");
const Cart = require("../cart/cart.model");
const Product = require("../product/product.model");
const Variant = require("../product/variant.model");
const ApiError = require("../../shared/ApiError");
const logger = require("../../config/logger");
const {
  loadSelections,
  checkSelection,
  variantLabel,
  optionsObject,
} = require("../product/purchasable");
const {
  ORDER,
  SHIPPING,
  ORDER_STATUS,
  PAYMENT_STATUS,
} = require("../../shared/constants");

/**
 * Placing orders.
 *
 * **The money rule, stated once.** Nothing in this file reads a price from the
 * request. Every figure on an order - unit price, line total, subtotal,
 * discount, shipping, total - is computed here from the catalog at the moment
 * of placement and written to the order. The validator that guards the way in
 * is `.strict()` and contains no price fields at all, so a request carrying
 * `total: 1` is rejected with a 422 rather than silently ignored. Both halves
 * matter: the schema makes the attack loud, and this file makes it pointless.
 *
 * **The stock rule.** Placing an order reserves inventory, and reaching a
 * cancelled or returned state gives it back. Without that, the catalog would
 * happily sell three hundred units of a product with three in stock, and the
 * first anyone would know is when the packing list could not be filled.
 */

/* ------------------------------ money helpers ----------------------------- */

/** Money is summed, so it is rounded once at the end rather than drifting. */
function money(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Which delivery zone an address falls in.
 *
 * `district` is the field the rate is written against, but it is optional at
 * checkout while `city` is required - so a customer who typed only "Dhaka"
 * as their city would otherwise be charged the outside-Dhaka rate for leaving
 * an optional box empty. Falling back to `city` is safe in the direction that
 * matters: every city called Dhaka is in the Dhaka district.
 *
 * Compared case- and whitespace-insensitively, because this is free text a
 * human typed and "dhaka " is the same place as "Dhaka".
 */
function isInsideDhaka(address = {}) {
  const zone = address.district?.trim() || address.city?.trim() || "";

  return zone.toLowerCase() === SHIPPING.DHAKA_ZONE;
}

/**
 * Delivery cost: 70 inside Dhaka, 130 outside, and free once the order is
 * worth SHIPPING.FREE_THRESHOLD or more.
 *
 * Decided here from the address and the server-computed subtotal, never read
 * from the request - the validator has no `shippingFee` field at all, so a
 * client that tries to name its own delivery charge gets a 422. The threshold
 * is checked against the whole subtotal rather than a single line, so five
 * items at 1,000 qualify exactly as one item at 5,000 does.
 *
 * @param {object} address The shipping address as validated.
 * @param {number} subtotal Sum of the line totals, already rounded.
 */
function shippingFeeFor(address, subtotal) {
  if (subtotal >= SHIPPING.FREE_THRESHOLD) return 0;

  return isInsideDhaka(address) ? SHIPPING.INSIDE_DHAKA_FEE : SHIPPING.OUTSIDE_DHAKA_FEE;
}

/* ------------------------------ order number ------------------------------ */

/**
 * A random unused six-digit number.
 *
 * `crypto.randomInt` rather than `Math.random`: the range is small enough that
 * a predictable sequence would let someone enumerate order numbers, and the
 * modulo bias of the naive version would make some numbers likelier than
 * others. This checks for a free number, and the unique index is what actually
 * guarantees it - two requests can both find the same number free, and the
 * loser retries at the insert.
 */
async function nextOrderNumber() {
  for (let attempt = 0; attempt < ORDER.NUMBER_ATTEMPTS; attempt += 1) {
    const candidate = String(crypto.randomInt(ORDER.NUMBER_MIN, ORDER.NUMBER_MAX + 1));
    const taken = await Order.exists({ orderNumber: candidate });

    if (!taken) return candidate;
  }

  // Reaching here means the number space is genuinely crowded, not that this
  // request was unlucky - see the note on ORDER in constants.
  throw ApiError.internal("Could not allocate an order number. Please try again.", {
    code: "ORDER_NUMBER_EXHAUSTED",
  });
}

/* ----------------------------- stock movement ----------------------------- */

/**
 * Takes units out of inventory for one line.
 *
 * The guard lives in the query, not in application code: `stock.quantity:
 * {$gte: n}` combined with `$inc: -n` is evaluated by the database as a single
 * atomic operation, so two orders racing for the last unit cannot both
 * succeed. Reading the stock, deciding, and then writing would let both
 * through - which is precisely how oversells happen.
 *
 * @returns {Promise<boolean>} false when there was not enough left.
 */
async function reserveLine(line) {
  if (!line.tracksInventory) return true;

  const Model = line.variant ? Variant : Product;
  const id = line.variant ? line.variant._id : line.product._id;

  const filter = { _id: id };

  // Backorders are permitted to drive the count negative - that is what
  // "we will get more in" means - so only the guard is dropped, not the
  // decrement, because the deficit still has to be visible somewhere.
  if (!line.allowsBackorder) filter["stock.quantity"] = { $gte: line.quantity };

  const result = await Model.updateOne(filter, { $inc: { "stock.quantity": -line.quantity } });

  return result.matchedCount === 1;
}

async function releaseLine({ productId, variantId, reservedQuantity }) {
  if (!reservedQuantity) return;

  const Model = variantId ? Variant : Product;
  const id = variantId ?? productId;

  await Model.updateOne({ _id: id }, { $inc: { "stock.quantity": reservedQuantity } });
}

/**
 * Reserves every line, undoing the ones already taken if any line fails.
 *
 * This is a compensating transaction rather than a real one. MongoDB
 * multi-document transactions need a replica set, which is not a dependency
 * worth forcing on a deployment for this; the compensation covers the same
 * failure and is easy to reason about because the only operation being undone
 * is a counter increment.
 *
 * The residual risk is honest: if the process dies between two reservations,
 * a few units stay held with no order behind them. That is recoverable by a
 * stock recount, and it fails in the safe direction - holding stock that is
 * really available, rather than selling stock that is not.
 */
async function reserveAll(lines) {
  const taken = [];

  for (const line of lines) {
    const ok = await reserveLine(line);

    if (!ok) {
      await releaseAll(taken);

      throw ApiError.unprocessable(
        `${line.product.name} does not have enough stock left.`,
        {
          code: "ORDER_INSUFFICIENT_STOCK",
          errors: [
            {
              field: `items.${line.index}.quantity`,
              code: "INSUFFICIENT_STOCK",
              message: `Only ${line.available ?? 0} of ${line.product.name} remain.`,
            },
          ],
        }
      );
    }

    taken.push({
      productId: line.product._id,
      variantId: line.variant?._id ?? null,
      reservedQuantity: line.tracksInventory ? line.quantity : 0,
    });
  }

  return taken;
}

async function releaseAll(reservations) {
  await Promise.all(reservations.map((reservation) => releaseLine(reservation)));
}

/**
 * Puts an order's reserved units back, exactly once.
 *
 * The `stockReleased` flag is checked by the caller before this runs and set
 * after; without it a retried cancellation would restock twice and invent
 * inventory that never existed.
 */
async function releaseOrderStock(order) {
  await releaseAll(
    order.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      reservedQuantity: item.reservedQuantity,
    }))
  );
}

/* -------------------------------- pricing --------------------------------- */

/**
 * Resolves the requested items into priced order lines, or refuses.
 *
 * Refuses rather than adjusts, unlike the cart. A basket is a draft and
 * capping an over-large quantity there is helpful; an order is a commitment,
 * and quietly shipping two of something a customer asked for five of is not a
 * quantity adjustment, it is the wrong order arriving at their door.
 */
async function priceItems(items) {
  const catalog = await loadSelections(items);

  const errors = [];
  const lines = [];

  items.forEach((item, index) => {
    const outcome = checkSelection(item, catalog);

    if (outcome.error) {
      errors.push({
        field: `items.${index}.${outcome.error.field}`,
        code: outcome.error.code,
        message: outcome.error.message,
      });
      return;
    }

    if (outcome.available != null && item.quantity > outcome.available) {
      errors.push({
        field: `items.${index}.quantity`,
        code: "INSUFFICIENT_STOCK",
        message: `Only ${outcome.available} of ${outcome.product.name} remain.`,
      });
      return;
    }

    lines.push({ ...outcome, index, quantity: item.quantity });
  });

  if (errors.length > 0) {
    throw ApiError.unprocessable("Your order could not be placed", {
      code: "ORDER_ITEMS_INVALID",
      errors,
    });
  }

  return lines;
}

/** Freezes a priced line into the immutable record stored on the order. */
function snapshotLine(line, reservation) {
  const options = line.variant ? optionsObject(line.variant) : null;

  return {
    productId: line.product._id,
    variantId: line.variant?._id ?? null,
    name: line.product.name,
    slug: line.product.slug,
    sku: line.variant?.sku ?? null,
    thumbnail: line.product.thumbnail?.src ?? null,
    variantOptions: options ?? undefined,
    variantLabel: options ? variantLabel(options) : null,
    unitPrice: line.unitPrice,
    originalPrice: line.originalPrice,
    quantity: line.quantity,
    lineTotal: money(line.unitPrice * line.quantity),
    reservedQuantity: reservation.reservedQuantity,
  };
}

function totalsFor(snapshots, address) {
  // Rounded before anything reads it, so the free-shipping threshold is
  // compared against the figure the customer is actually charged rather than
  // a float that lands a hair under it.
  const subtotal = money(snapshots.reduce((sum, item) => sum + item.lineTotal, 0));

  // Savings against the struck-through price. Reported, not deducted -
  // `unitPrice` is already the price being charged.
  const discount = snapshots.reduce(
    (sum, item) =>
      sum +
      (item.originalPrice && item.originalPrice > item.unitPrice
        ? (item.originalPrice - item.unitPrice) * item.quantity
        : 0),
    0
  );

  const shippingFee = shippingFeeFor(address, subtotal);

  return {
    subtotal,
    discount: money(discount),
    shippingFee: money(shippingFee),
    total: money(subtotal + shippingFee),
  };
}

/* ------------------------------ presentation ------------------------------ */

function presentItem(item) {
  const options =
    item.variantOptions instanceof Map
      ? Object.fromEntries(item.variantOptions)
      : item.variantOptions ?? null;

  return {
    id: String(item._id),
    productId: String(item.productId),
    variantId: item.variantId ? String(item.variantId) : null,
    name: item.name,
    slug: item.slug ?? null,
    sku: item.sku ?? null,
    thumbnail: item.thumbnail ?? null,
    variantOptions: options,
    variantLabel: item.variantLabel ?? null,
    unitPrice: item.unitPrice,
    originalPrice: item.originalPrice ?? null,
    quantity: item.quantity,
    lineTotal: item.lineTotal,
  };
}

/**
 * The order as JSON.
 *
 * Staff see strictly more: the IP and device the order came from, the internal
 * stock bookkeeping, and who last touched it. A customer sees their own order
 * and nothing about how the business runs - `client` in particular is the sort
 * of field that looks harmless until it is reflected back to whoever placed
 * the order and confirms which of their devices the shop can see.
 */
function presentOrder(order, { forStaff = false } = {}) {
  if (!order) return null;

  const base = {
    id: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    currency: order.currency,
    subtotal: order.subtotal,
    discount: order.discount,
    shippingFee: order.shippingFee,
    total: order.total,
    itemCount: order.items.length,
    totalQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
    items: order.items.map(presentItem),
    contact: { name: order.contact.name, phone: order.contact.phone },
    email: order.email ?? null,
    shippingAddress: order.shippingAddress,
    note: order.note ?? null,
    isGuestOrder: order.userId == null,
    statusHistory: (order.statusHistory ?? []).map((event) => ({
      status: event.status,
      note: event.note ?? null,
      changedBy: event.changedBy ?? null,
      changedAt: event.changedAt,
    })),
    placedAt: order.placedAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };

  if (!forStaff) return base;

  return {
    ...base,
    userId: order.userId ?? null,
    client: order.client ?? null,
    stockReleased: order.stockReleased ?? false,
    updatedBy: order.updatedBy ?? null,
    deletedAt: order.deletedAt ?? null,
    items: order.items.map((item) => ({
      ...presentItem(item),
      reservedQuantity: item.reservedQuantity ?? 0,
    })),
  };
}

/* -------------------------------- commands -------------------------------- */

/**
 * Scopes an idempotency key to whoever is placing the order.
 *
 * See the field's comment on the model for why a bare key would be an
 * order-disclosure hole. The IP fallback is deliberately the weakest of the
 * three and only applies to an anonymous guest who gave no email - the case
 * where there is nothing better to scope by.
 */
function scopedIdempotencyKey(key, { actor, email, ip }) {
  if (!key) return null;

  const owner = actor ? `u:${actor.id}` : email ? `e:${email}` : `i:${ip ?? "unknown"}`;

  return `${owner}:${key}`;
}

/**
 * Places an order.
 *
 * @param {object} input Validated body.
 * @param {object} context
 * @param {object|null} context.actor The signed-in user, or null for a guest.
 * @param {object} context.client IP and parsed user agent.
 */
async function placeOrder(input, { actor = null, client = {} } = {}) {
  const email = input.email ?? actor?.email ?? null;
  const idempotencyKey = scopedIdempotencyKey(input.idempotencyKey, {
    actor,
    email,
    ip: client.ip,
  });

  // A retried submission returns the original order rather than placing a
  // second one. Safe to answer from here because the key is namespaced to this
  // caller, so the row found can only ever be their own.
  if (idempotencyKey) {
    const existing = await Order.findOne({ idempotencyKey }).lean();

    if (existing) {
      return { order: presentOrder(existing), duplicate: true, accountInvite: null };
    }
  }

  const lines = await priceItems(input.items);
  const reservations = await reserveAll(lines);

  try {
    const snapshots = lines.map((line, index) => snapshotLine(line, reservations[index]));
    const totals = totalsFor(snapshots, input.shippingAddress);

    const order = await createWithUniqueNumber({
      userId: actor?.id ?? null,
      email,
      contact: input.contact,
      shippingAddress: input.shippingAddress,
      items: snapshots,
      currency: lines[0].product.currency ?? "BDT",
      ...totals,
      paymentMethod: input.paymentMethod,
      paymentStatus: PAYMENT_STATUS.DUE,
      status: ORDER_STATUS.PENDING,
      note: input.note ?? null,
      statusHistory: [
        {
          status: ORDER_STATUS.PENDING,
          note: null,
          changedBy: actor?.id ?? null,
          changedAt: new Date(),
        },
      ],
      client,
      idempotencyKey,
      placedAt: new Date(),
    });

    // Best-effort tidy-up: the order is placed and must not fail because the
    // basket could not be emptied afterwards.
    if (actor) {
      await clearOrderedLines(actor.id, snapshots).catch((error) =>
        logger.error({ err: error, userId: actor.id }, "Failed to clear ordered cart lines")
      );
    }

    const accountInvite = await inviteIfRequested(input, {
      actor,
      email,
      orderNumber: order.orderNumber,
    });

    return { order: presentOrder(order.toObject()), duplicate: false, accountInvite };
  } catch (error) {
    // The order did not get written, so the units it was holding have to go
    // back - otherwise a failed checkout silently removes stock from sale.
    await releaseAll(reservations).catch((releaseError) =>
      logger.error({ err: releaseError }, "Failed to release stock after a failed order")
    );

    throw error;
  }
}

/**
 * Sends the "create your account" invitation, when a guest asked for one.
 *
 * **Never throws.** The order is already written and paid-on-delivery by this
 * point; a mail outage or a duplicate address must not turn a completed
 * purchase into a 500 that tells the customer to try again - which is how one
 * order becomes two. The outcome is reported in the response instead, so the
 * frontend knows whether to show "check your inbox" or "you already have an
 * account, sign in".
 *
 * Ignored entirely for a signed-in caller: they have an account, and the flag
 * is a guest-checkout affordance.
 */
async function inviteIfRequested(input, { actor, email, orderNumber }) {
  if (!input.createAccount || actor || !email) return null;

  try {
    // Required lazily. `auth.service` reaches back into the order module to
    // claim guest orders once an account exists, and requiring it at the top
    // of this file would close that loop into a cycle.
    const authService = require("../auth/auth.service");

    const result = await authService.inviteAccountFromCheckout({
      email,
      name: input.contact.name,
      phone: input.contact.phone,
      orderNumber,
    });

    return result.invited
      ? { status: "VERIFICATION_SENT", email }
      : { status: result.reason, email };
  } catch (error) {
    logger.error({ err: error, email }, "Failed to send checkout account invitation");

    return { status: "INVITATION_FAILED", email };
  }
}

/**
 * Inserts the order, retrying if the random order number collided.
 *
 * The unique index is the real guarantee - `nextOrderNumber` only reduces how
 * often this loop is needed.
 */
async function createWithUniqueNumber(payload, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await Order.create({ ...payload, orderNumber: await nextOrderNumber() });
    } catch (error) {
      const collided = error?.code === 11000 && error?.keyPattern?.orderNumber;

      if (!collided || attempt >= attempts) throw error;
    }
  }
}

/**
 * Removes the lines that were just ordered from the shopper's cart.
 *
 * Only the ordered ones: a customer who checked out two of five items still
 * has the other three waiting, which is what they would expect.
 */
async function clearOrderedLines(userId, snapshots) {
  const conditions = snapshots.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
  }));

  await Cart.updateOne({ userId }, { $pull: { items: { $or: conditions } } });
}

/* --------------------------------- reads ---------------------------------- */

function statusCondition(status) {
  if (!status) return undefined;
  return Array.isArray(status) ? { $in: status } : status;
}

function sortStage(sort) {
  const direction = sort.direction === "asc" ? 1 : -1;
  // `_id` breaks ties, so pagination cannot show the same order on two pages.
  return { [sort.field]: direction, _id: -1 };
}

/**
 * A customer's own orders.
 *
 * `userId` comes from the verified token and is applied last, so no filter
 * combination can widen the result past the caller's own orders.
 */
async function listMine(userId, params) {
  const filter = { userId, deletedAt: null };

  const status = statusCondition(params.status);
  if (status) filter.status = status;

  if (params.placedFrom || params.placedTo) {
    filter.placedAt = {};
    if (params.placedFrom) filter.placedAt.$gte = params.placedFrom;
    if (params.placedTo) filter.placedAt.$lte = params.placedTo;
  }

  const { page, limit } = params.pagination;

  const [records, total] = await Promise.all([
    Order.find(filter).sort(sortStage(params.sort)).skip(page * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);

  return {
    items: records.map((record) => presentOrder(record)),
    total,
    page,
    limit,
  };
}

/**
 * One of the caller's own orders.
 *
 * Scoped by `userId` in the query rather than fetched and then checked, so
 * there is no window in which the wrong order exists in a variable. Answers
 * 404 rather than 403 for someone else's order, because "this order exists but
 * is not yours" is itself information - order numbers are guessable.
 */
async function getMine(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, userId, deletedAt: null }).lean();

  if (!order) throw ApiError.notFound("Order not found");

  return presentOrder(order);
}

module.exports = {
  placeOrder,
  listMine,
  getMine,
  // Shared with the admin service, which must not re-implement any of them.
  presentOrder,
  releaseOrderStock,
  statusCondition,
  sortStage,
  money,
};
