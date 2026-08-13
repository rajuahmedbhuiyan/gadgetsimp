"use strict";

const service = require("./wishlist.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");

/**
 * The wishlist is private, and the owner always comes from the verified token.
 * No handler here reads a user id from the request.
 */

async function addItems(req, res) {
  const result = await service.addItems(req.user.id, req.validated.body);

  return sendResponse(res, { message: "Saved to your wishlist", data: result });
}

async function removeItems(req, res) {
  const result = await service.removeItems(req.user.id, req.validated.body);

  return sendResponse(res, { message: "Removed from your wishlist", data: result });
}

async function toggle(req, res) {
  const result = await service.toggle(req.user.id, req.validated.body);

  return sendResponse(res, {
    message: result.inWishlist ? "Saved to your wishlist" : "Removed from your wishlist",
    data: result,
  });
}

async function filterItems(req, res) {
  const result = await service.list(req.user.id, req.validated.body);

  return sendResponse(res, {
    message: "Wishlist retrieved",
    data: { items: result.items },
    meta: paginationMeta(result),
  });
}

async function listIds(req, res) {
  const data = await service.listIds(req.user.id);

  return sendResponse(res, { message: "Wishlist ids retrieved", data });
}

async function clear(req, res) {
  const result = await service.clear(req.user.id);

  return sendResponse(res, { message: "Wishlist cleared", data: result });
}

module.exports = { addItems, removeItems, toggle, filterItems, listIds, clear };
