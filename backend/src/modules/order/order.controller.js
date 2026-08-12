"use strict";

const service = require("./order.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");
const { clientInfoFrom } = require("../../shared/userAgent");

/**
 * The customer side of orders.
 *
 * Two things are taken from the request rather than the body, and neither is
 * negotiable:
 *
 *   - **who is ordering**, from the verified token when there is one. A body
 *     field for it would be an invitation to place orders as somebody else.
 *   - **where from**, from the connection and the User-Agent header, so the
 *     record of a disputed order includes the device it came from.
 *
 * Everything about money is decided in the service, from the catalog. Nothing
 * in this file touches a price.
 */

/**
 * Places an order. Works signed in or as a guest - a shopper should not have
 * to create an account to buy something, which is the entire reason the
 * `createAccount` flag exists rather than a hard signup wall.
 */
async function placeOrder(req, res) {
  const result = await service.placeOrder(req.validated.body, {
    actor: req.user ?? null,
    client: clientInfoFrom(req),
  });

  return sendResponse(res, {
    // A replayed idempotency key answers 200 with the original order rather
    // than 201, so a client can tell "created" from "already had one".
    statusCode: result.duplicate ? 200 : 201,
    code: result.duplicate ? "ORDER_ALREADY_PLACED" : undefined,
    message: result.duplicate ? "This order was already placed" : "Order placed",
    data: { order: result.order, accountInvite: result.accountInvite ?? null },
  });
}

async function myOrders(req, res) {
  const result = await service.listMine(req.user.id, req.validated.body);

  return sendResponse(res, {
    message: "Orders retrieved",
    data: { orders: result.items },
    meta: paginationMeta(result),
  });
}

async function myOrderById(req, res) {
  const order = await service.getMine(req.user.id, req.validated.params.id);

  return sendResponse(res, { message: "Order retrieved", data: { order } });
}

module.exports = { placeOrder, myOrders, myOrderById };
