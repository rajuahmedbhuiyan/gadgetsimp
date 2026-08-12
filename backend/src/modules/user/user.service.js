"use strict";

const User = require("./user.model");
const ApiError = require("../../shared/ApiError");
const QueryFeatures = require("../../shared/queryFeatures");
const { ROLES, roleRank, roleAtLeast, assignableRoles } = require("../../shared/constants");

async function getById(userId) {
  const user = await User.findById(userId);

  if (!user) throw ApiError.notFound("User not found");

  return user.toJSON();
}

async function updateProfile(userId, updates) {
  const user = await User.findByIdAndUpdate(userId, updates, {
    returnDocument: "after",
    runValidators: true,
  });

  if (!user) throw ApiError.notFound("User not found");

  return user.toJSON();
}

async function listUsers(params) {
  const features = new QueryFeatures(User.find(), params, {
    allowedFilters: ["role", "isActive"],
    allowedSortFields: ["createdAt", "lastName", "firstName", "lastLoginAt", "role"],
    defaultSort: "-createdAt",
  }).apply();

  const { items, total, page, limit } = await features.execute();

  // `.lean()` in execute() skips the schema's toJSON transform, so the
  // sensitive fields are stripped and the integer id is surfaced explicitly.
  return {
    items: items.map(({ password, sessions, tokenVersion, passwordChangedAt, __v, _id, ...rest }) => ({
      id: _id,
      ...rest,
      fullName: `${rest.firstName} ${rest.lastName}`.trim(),
    })),
    total,
    page,
    limit,
  };
}

/**
 * Changes a user's role.
 *
 * Three separate guards, because role assignment is the one endpoint where a
 * mistake hands out permanent power:
 *
 *   1. No self-edit. Otherwise an admin could promote themselves to owner.
 *   2. No granting a role at or above your own rank - so an admin can create
 *      moderators but never another admin, and only an owner mints owners.
 *   3. No acting on someone senior to you, which would let a moderator demote
 *      the owner.
 */
async function updateRole(targetUserId, role, actor) {
  if (Number(targetUserId) === Number(actor.id)) {
    throw ApiError.badRequest("You cannot change your own role");
  }

  const user = await User.findById(targetUserId).select("+tokenVersion");

  if (!user) throw ApiError.notFound("User not found");

  if (roleAtLeast(user.role, actor.role) && user.role !== ROLES.CUSTOMER) {
    throw ApiError.forbidden("You cannot modify a user at or above your own role", {
      code: "INSUFFICIENT_ROLE",
    });
  }

  if (roleRank(role) >= roleRank(actor.role)) {
    throw ApiError.forbidden(
      `You can only assign roles below your own. Available to you: ${assignableRoles(actor.role).join(", ") || "none"}`,
      { code: "ROLE_ABOVE_ACTOR" }
    );
  }

  // The platform must never be left without an owner.
  if (user.role === ROLES.OWNER) {
    const remainingOwners = await User.countDocuments({
      role: ROLES.OWNER,
      isActive: true,
      _id: { $ne: user._id },
    });

    if (remainingOwners === 0) {
      throw ApiError.conflict("Cannot demote the last remaining owner");
    }
  }

  user.role = role;
  // Force a re-auth so the new role takes effect on the next request rather
  // than whenever the old token happens to expire.
  user.tokenVersion += 1;
  await user.save();

  return user.toJSON();
}

async function updateStatus(targetUserId, isActive, actor) {
  if (Number(targetUserId) === Number(actor.id)) {
    throw ApiError.badRequest("You cannot change your own account status");
  }

  const user = await User.findById(targetUserId).select("+tokenVersion +sessions");

  if (!user) throw ApiError.notFound("User not found");

  if (roleAtLeast(user.role, actor.role) && user.role !== ROLES.CUSTOMER) {
    throw ApiError.forbidden("You cannot modify a user at or above your own role", {
      code: "INSUFFICIENT_ROLE",
    });
  }

  if (!isActive && user.role === ROLES.OWNER) {
    const remainingOwners = await User.countDocuments({
      role: ROLES.OWNER,
      isActive: true,
      _id: { $ne: user._id },
    });

    if (remainingOwners === 0) {
      throw ApiError.conflict("Cannot deactivate the last remaining owner");
    }
  }

  user.isActive = isActive;

  if (!isActive) {
    user.tokenVersion += 1;
    user.sessions = [];
  }

  await user.save();

  return user.toJSON();
}

module.exports = {
  getById,
  updateProfile,
  listUsers,
  updateRole,
  updateStatus,
};
