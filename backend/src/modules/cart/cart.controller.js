"use strict";

const service = require("./cart.service");
const { sendResponse } = require("../../shared/sendResponse");

/**
 * Every endpoint here answers with the **whole cart**, not just what changed.
 *
 * A cart mutation can come back different from what was asked for - a quantity
 * capped by stock, a line that merged into an existing one - so a client that
 * patched its local state from a delta would drift from the server on exactly
 * the requests where being right matters. Returning the full cart makes the
 * response authoritative and the client's job a single assignment.
 *
 * The user is always taken from the verified token, never from the body: the
 * cart being read or written is the caller's, and there is no request shape
 * that can say otherwise.
 */

async function getCart(req, res) {
  const result = await service.getCart(req.user.id);

  return sendResponse(res, { message: "Cart retrieved", data: result });
}

async function count(req, res) {
  const data = await service.count(req.user.id);

  return sendResponse(res, { message: "Cart count retrieved", data });
}

async function addItems(req, res) {
  const result = await service.addItems(req.user.id, req.validated.body);

  return sendResponse(res, {
    // 200, not 201: the cart already existed as a concept and the response is
    // the cart itself, not a pointer to something newly created.
    message: result.adjustments.length > 0 ? "Cart updated with adjustments" : "Cart updated",
    data: result,
  });
}

async function updateItems(req, res) {
  const result = await service.updateItems(req.user.id, req.validated.body);

  return sendResponse(res, {
    message: result.adjustments.length > 0 ? "Cart updated with adjustments" : "Cart updated",
    data: result,
  });
}

async function removeItems(req, res) {
  const result = await service.removeItems(req.user.id, req.validated.body);

  return sendResponse(res, { message: "Items removed from cart", data: result });
}

async function clear(req, res) {
  const result = await service.clear(req.user.id);

  return sendResponse(res, { message: "Cart cleared", data: result });
}

module.exports = { getCart, count, addItems, updateItems, removeItems, clear };
