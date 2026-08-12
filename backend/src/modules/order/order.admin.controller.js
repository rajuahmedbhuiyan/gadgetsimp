"use strict";

const service = require("./order.admin.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");

/**
 * The staff side of orders.
 *
 * A separate controller from the customer one, mounted on a separate path
 * behind a role gate, because the two differ in the one way that matters:
 * every read here is unscoped and reaches every order in the system. Sharing a
 * file with the customer handlers would leave an unscoped `Order.find` one
 * copy-paste away from a route anybody can call.
 */

async function filterOrders(req, res) {
  const result = await service.list(req.validated.body);

  return sendResponse(res, {
    message: "Orders retrieved",
    data: { orders: result.items },
    meta: paginationMeta(result),
  });
}

async function getOrder(req, res) {
  const order = await service.getById(req.validated.params.id, { includeDeleted: true });

  return sendResponse(res, { message: "Order retrieved", data: { order } });
}

async function changeStatus(req, res) {
  const order = await service.changeStatus(
    req.validated.params.id,
    req.validated.body,
    req.user
  );

  return sendResponse(res, { message: `Order marked ${order.status}`, data: { order } });
}

async function updateDetails(req, res) {
  const order = await service.updateDetails(
    req.validated.params.id,
    req.validated.body,
    req.user
  );

  return sendResponse(res, { message: "Order details updated", data: { order } });
}

async function softDelete(req, res) {
  const order = await service.softDelete(req.validated.params.id, req.user);

  return sendResponse(res, { message: "Order deleted", data: { order } });
}

async function hardDelete(req, res) {
  const result = await service.hardDelete(req.validated.params.id, req.user);

  return sendResponse(res, { message: "Order permanently deleted", data: result });
}

module.exports = {
  filterOrders,
  getOrder,
  changeStatus,
  updateDetails,
  softDelete,
  hardDelete,
};
