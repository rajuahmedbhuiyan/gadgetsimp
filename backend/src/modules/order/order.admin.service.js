"use strict";

const Order = require("./order.model");
const ApiError = require("../../shared/ApiError");
const logger = require("../../config/logger");
const {
  presentOrder,
  releaseOrderStock,
  statusCondition,
  sortStage,
} = require("./order.service");
const {
  ORDER_STATUS,
  ORDER_STATUS_FLOW,
  ORDER_NEGATIVE_STATUSES,
  ORDER_STOCK_RELEASING_STATUSES,
  PAYMENT_STATUS,
} = require("../../shared/constants");

/**
 * Staff-side order operations.
 *
 * Separate from `order.service` because the two answer to different people and
 * different rules: everything there is scoped to one customer's own orders by
 * a `userId` the caller cannot influence, while everything here reaches every
 * order in the system and is gated by role instead. Keeping them in one file
 * would put an unscoped `Order.find` a copy-paste away from a customer route.
 *
 * What is *not* here is as deliberate as what is. There is no way to edit a
 * price, a line item, a quantity or a total. A moderator fixing a mistyped
 * house number is routine; a moderator able to change what an order costs
 * after the customer agreed to it is a different system entirely, and one that
 * needs an approval trail before it exists.
 */

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The staff queue.
 *
 * Returns the full staff shape - IP, device, stock bookkeeping, ownership -
 * because the person working this list is deciding whether to dispatch, and
 * hiding half the record just means opening every order individually.
 */
async function list(params) {
  const filter = {};

  if (!params.includeDeleted) filter.deletedAt = null;

  const status = statusCondition(params.status);
  if (status) filter.status = status;

  if (params.paymentMethod) filter.paymentMethod = params.paymentMethod;
  if (params.userId != null) filter.userId = params.userId;

  // Guest orders are the ones with no account behind them.
  if (params.guestOnly) filter.userId = null;

  if (params.search) {
    const pattern = { $regex: escapeRegex(params.search), $options: "i" };

    // One box, because that is what the person on the phone has: a number the
    // customer read out, or their name.
    filter.$or = [
      { orderNumber: pattern },
      { "contact.name": pattern },
      { "contact.phone": pattern },
      { email: pattern },
    ];
  }

  if (params.minTotal != null || params.maxTotal != null) {
    filter.total = {};
    if (params.minTotal != null) filter.total.$gte = params.minTotal;
    if (params.maxTotal != null) filter.total.$lte = params.maxTotal;
  }

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
    items: records.map((record) => presentOrder(record, { forStaff: true })),
    total,
    page,
    limit,
  };
}

async function getById(orderId, { includeDeleted = false } = {}) {
  const filter = { _id: orderId };
  if (!includeDeleted) filter.deletedAt = null;

  const order = await Order.findOne(filter).lean();

  if (!order) throw ApiError.notFound("Order not found");

  return presentOrder(order, { forStaff: true });
}

/**
 * Moves an order to a new status.
 *
 * Three rules, all enforced here rather than trusted to the caller:
 *
 * **The transition must be legal.** `ORDER_STATUS_FLOW` is the map, and it
 * exists so an order cannot go from DELIVERED back to PENDING. Any status
 * being settable from any other is not a workflow, it is a corruption that
 * surfaces weeks later in a report nobody can reconcile.
 *
 * **A bad outcome needs a reason.** RETURNED and CANCELED require a note,
 * because those are the two statuses anyone ever looks back at - during a
 * refund dispute, a courier claim, or an argument about who cancelled - and
 * the bare word answers none of those questions.
 *
 * **Ending an order releases its stock**, exactly once, guarded by
 * `stockReleased`. Restocking twice would invent inventory that never existed.
 */
async function changeStatus(orderId, { status, note }, actor) {
  const order = await Order.findOne({ _id: orderId, deletedAt: null });

  if (!order) throw ApiError.notFound("Order not found");

  if (order.status === status) {
    throw ApiError.unprocessable(`This order is already ${status}.`, {
      code: "ORDER_STATUS_UNCHANGED",
    });
  }

  const allowed = ORDER_STATUS_FLOW[order.status] ?? [];

  if (!allowed.includes(status)) {
    throw ApiError.unprocessable(
      allowed.length === 0
        ? `A ${order.status} order is final and cannot change status.`
        : `An order that is ${order.status} can only move to: ${allowed.join(", ")}.`,
      {
        code: "ORDER_STATUS_TRANSITION_INVALID",
        errors: [{ field: "status", code: "TRANSITION_INVALID", message: `From ${order.status} to ${status}` }],
      }
    );
  }

  const trimmedNote = note?.trim() || null;

  if (ORDER_NEGATIVE_STATUSES.includes(status) && !trimmedNote) {
    throw ApiError.unprocessable(`A note is required when marking an order ${status}.`, {
      code: "ORDER_STATUS_NOTE_REQUIRED",
      errors: [
        {
          field: "note",
          code: "NOTE_REQUIRED",
          message: `Explain why this order was ${status.toLowerCase()}.`,
        },
      ],
    });
  }

  // Stock goes back before the status is written. If the restock fails, the
  // order stays in its current state and the operation can be retried - the
  // opposite order would leave a cancelled order whose units were never
  // returned to the shelf, which nothing would ever notice.
  if (ORDER_STOCK_RELEASING_STATUSES.includes(status) && !order.stockReleased) {
    await releaseOrderStock(order);
    order.stockReleased = true;
  }

  // Cash on delivery is settled by the courier handing it over, so delivery is
  // the event that marks it paid.
  if (status === ORDER_STATUS.DELIVERED) order.paymentStatus = PAYMENT_STATUS.PAID;

  order.status = status;
  order.updatedBy = actor.id;
  order.statusHistory.push({
    status,
    note: trimmedNote,
    changedBy: actor.id,
    changedAt: new Date(),
  });

  await order.save();

  logger.info(
    { orderId: order._id, status, actorId: actor.id },
    "Order status changed"
  );

  return presentOrder(order.toObject(), { forStaff: true });
}

/**
 * Corrects the delivery details.
 *
 * Address fields merge rather than replace, so sending only `city` fixes the
 * city without wiping the street - the opposite would turn a one-field
 * correction into a silent data loss.
 *
 * Deliberately refuses to touch a finished order: a delivered order's address
 * is the historical record of where the goods actually went, and editing it
 * afterwards rewrites the evidence rather than fixing anything.
 *
 * **The delivery charge is not recalculated** when the district changes, even
 * though placement derives it from the district. The total on an order is what
 * the customer agreed to pay, and a moderator correcting a typo must not
 * silently change the amount the courier will collect at the door. If a
 * correction genuinely moves the order to another zone, that is a
 * conversation with the customer, not a background repricing.
 */
async function updateDetails(orderId, input, actor) {
  const order = await Order.findOne({ _id: orderId, deletedAt: null });

  if (!order) throw ApiError.notFound("Order not found");

  const finished = [ORDER_STATUS.DELIVERED, ORDER_STATUS.RETURNED, ORDER_STATUS.CANCELED];

  if (finished.includes(order.status)) {
    throw ApiError.unprocessable(
      `This order is ${order.status} - its delivery details are now a record of what happened and cannot be edited.`,
      { code: "ORDER_FINALISED" }
    );
  }

  if (input.contact?.name != null) order.contact.name = input.contact.name;
  if (input.contact?.phone != null) order.contact.phone = input.contact.phone;

  if (input.shippingAddress) {
    for (const [field, value] of Object.entries(input.shippingAddress)) {
      order.shippingAddress[field] = value;
    }
  }

  // `null` clears the note, `undefined` leaves it alone - which is why the
  // validator accepts nullish here rather than optional.
  if (input.note !== undefined) order.note = input.note?.trim() || null;

  order.updatedBy = actor.id;

  await order.save();

  return presentOrder(order.toObject(), { forStaff: true });
}

/**
 * Soft delete, admin and above.
 *
 * Hides the order from every listing without destroying it. An order is a
 * financial record - it is what a refund, a tax return and a dispute are all
 * argued from - so the default removal keeps the row and the numbers.
 *
 * A live order's stock is released on the way out, for the same reason
 * cancelling releases it: units held for an order nobody can see are units
 * permanently lost from sale.
 */
async function softDelete(orderId, actor) {
  const order = await Order.findOne({ _id: orderId, deletedAt: null });

  if (!order) throw ApiError.notFound("Order not found");

  if (!order.stockReleased) {
    await releaseOrderStock(order);
    order.stockReleased = true;
  }

  order.deletedAt = new Date();
  order.updatedBy = actor.id;

  await order.save();

  logger.warn({ orderId: order._id, actorId: actor.id }, "Order soft deleted");

  return presentOrder(order.toObject(), { forStaff: true });
}

/**
 * Permanent delete, admin and above.
 *
 * Genuinely irreversible, and separate from the soft delete rather than a flag
 * on it - a destructive operation should be something you have to ask for by
 * name, not something a stray query parameter turns on.
 *
 * Stock is released first if it was still held, because after this there is no
 * record left to release it from.
 */
async function hardDelete(orderId, actor) {
  const order = await Order.findOne({ _id: orderId });

  if (!order) throw ApiError.notFound("Order not found");

  if (!order.stockReleased) await releaseOrderStock(order);

  await order.deleteOne();

  logger.warn(
    { orderId, orderNumber: order.orderNumber, actorId: actor.id },
    "Order permanently deleted"
  );

  return { id: orderId, orderNumber: order.orderNumber };
}

module.exports = { list, getById, changeStatus, updateDetails, softDelete, hardDelete };
