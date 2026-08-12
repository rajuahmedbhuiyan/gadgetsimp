"use strict";

const Order = require("./order.model");
const logger = require("../../config/logger");

/**
 * Attaching guest orders to an account, in its own file for one reason:
 * dependency direction.
 *
 * The checkout needs auth (to invite a guest to register) and auth needs this
 * (to hand that guest their past orders once they do). Putting this in
 * `order.service` would close the loop into a require cycle, and a cycle
 * between two service modules resolves to whichever half loaded first - which
 * works until someone reorders an import and a function is quietly
 * `undefined` at runtime.
 *
 * This file depends only on the model, so the graph stays acyclic:
 * `order.service -> auth.service -> order.link -> order.model`.
 */

/**
 * Claims a guest's past orders for the account that was just created.
 *
 * This is what makes "my orders" show the purchase that prompted the signup in
 * the first place - a customer who checked out as a guest, then accepted the
 * offer to create an account, would otherwise sign in to an empty list and
 * conclude their order was lost.
 *
 * **Only ever claims orders with no owner.** An order already attached to a
 * different account is left alone. Without that condition, an address changing
 * hands - or an attacker registering an address that once belonged to someone
 * else - would transfer another person's order history along with it. The
 * email is proven by this point, but proving you own an address today says
 * nothing about who owned it when the order was placed.
 *
 * @returns {Promise<number>} How many orders were claimed.
 */
async function claimGuestOrders(email, userId) {
  if (!email || userId == null) return 0;

  const result = await Order.updateMany(
    { email, userId: null, deletedAt: null },
    { $set: { userId } }
  );

  if (result.modifiedCount > 0) {
    logger.info(
      { userId, count: result.modifiedCount },
      "Claimed guest orders for a newly created account"
    );
  }

  return result.modifiedCount;
}

module.exports = { claimGuestOrders };
