"use strict";

const userService = require("./user.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");

// The acting user, passed to services that need to compare ranks. Services
// take this rather than reading `req` themselves, so they stay callable from
// a script or a worker.
function actor(req) {
  return { id: req.user.id, role: req.user.role };
}

async function getMe(req, res) {
  return sendResponse(res, {
    message: "Profile retrieved",
    data: { user: req.user.toJSON() },
  });
}

async function updateMe(req, res) {
  const user = await userService.updateProfile(req.user.id, req.validated.body);

  return sendResponse(res, { message: "Profile updated", data: { user } });
}

async function listUsers(req, res) {
  const { items, total, page, limit } = await userService.listUsers(req.validated.query);

  return sendResponse(res, {
    message: "Users retrieved",
    data: { users: items },
    meta: paginationMeta({ page, limit, total }),
  });
}

async function getUser(req, res) {
  const user = await userService.getById(req.validated.params.id);

  return sendResponse(res, { message: "User retrieved", data: { user } });
}

async function updateRole(req, res) {
  const user = await userService.updateRole(
    req.validated.params.id,
    req.validated.body.role,
    actor(req)
  );

  return sendResponse(res, { message: "Role updated", data: { user } });
}

async function updateStatus(req, res) {
  const user = await userService.updateStatus(
    req.validated.params.id,
    req.validated.body.isActive,
    actor(req)
  );

  return sendResponse(res, { message: "Account status updated", data: { user } });
}

module.exports = {
  getMe,
  updateMe,
  listUsers,
  getUser,
  updateRole,
  updateStatus,
};
