"use strict";

const userService = require("./user.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");

/**
 * Controllers stay thin: read validated input, call the service, send the
 * response. No business rules, no database access, no try/catch - Express 5
 * forwards a rejected promise to the error handler on its own.
 */

/**
 * The acting user, passed to services that compare ranks. Services take this
 * rather than reading `req` themselves, so they stay callable from a script,
 * a worker or a test without a fake request object.
 */
function actor(req) {
  return { id: req.user.id, role: req.user.role };
}

/* ---------------------------------- Self --------------------------------- */

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

/* --------------------------------- Staff --------------------------------- */

/**
 * Filtered, paginated user list. POST because the filter travels in the body -
 * see the note on `filterUsers` in user.validation.js.
 */
async function filterUsers(req, res) {
  const { items, total, page, limit } = await userService.filterUsers(req.validated.body);

  return sendResponse(res, {
    message: "Users retrieved",
    data: { users: items },
    meta: paginationMeta({ page, limit, total }),
  });
}

async function createUser(req, res) {
  const { user, generatedPassword } = await userService.createUser(
    req.validated.body,
    actor(req)
  );

  return sendResponse(res, {
    statusCode: 201,
    message: generatedPassword
      ? "User created. The generated password is shown once here and has been emailed to them."
      : "User created",
    // `generatedPassword` is present only when the API generated it. Echoing
    // back a password the caller supplied would put it in their logs for no
    // benefit.
    data: { user, ...(generatedPassword ? { generatedPassword } : {}) },
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
    req.validated.body.status,
    actor(req)
  );

  return sendResponse(res, { message: "Account status updated", data: { user } });
}

/* -------------------------------- Deletion ------------------------------- */

/**
 * Soft delete. The account is flagged DELETED and signed out, but the row
 * stays so orders and audit trails keep resolving.
 */
async function softDelete(req, res) {
  const user = await userService.softDelete(req.validated.params.id, actor(req));

  return sendResponse(res, { message: "User deleted", data: { user } });
}

/**
 * Hard delete. Irreversible, so it returns only what was removed - there is
 * no document left to represent.
 */
async function hardDelete(req, res) {
  const deleted = await userService.hardDelete(req.validated.params.id, actor(req));

  return sendResponse(res, {
    message: "User permanently deleted",
    data: { deleted },
  });
}

module.exports = {
  getMe,
  updateMe,
  filterUsers,
  createUser,
  getUser,
  updateRole,
  updateStatus,
  softDelete,
  hardDelete,
};
