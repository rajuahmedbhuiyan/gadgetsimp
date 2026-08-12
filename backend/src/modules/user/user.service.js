"use strict";

const User = require("./user.model");
const ApiError = require("../../shared/ApiError");
const logger = require("../../config/logger");
const { sendMail } = require("../../config/mailer");
const { generatePassword } = require("../../shared/generatePassword");
const { accountCreatedEmail } = require("./user.emails");
const {
  ROLES,
  roleRank,
  roleAtLeast,
  assignableRoles,
  AUTH_PROVIDERS,
  USER_STATUS,
} = require("../../shared/constants");

/**
 * Creates an account directly, bypassing the email-verification signup flow.
 *
 * Owner-only, and it skips verification on purpose: the account is being
 * vouched for by a human with the highest privilege in the system, so a
 * confirmation round trip proves nothing that their authority does not
 * already. The user is created verified and can sign in immediately.
 *
 * `password` is optional. Omitted, one is generated, emailed to the new user
 * and returned once to the creator so they can relay it another way. It is
 * returned *only* in that case - echoing back a password the caller already
 * knows would put it in their logs for nothing.
 */
async function createUser(input, actor) {
  const { password, role, sendEmail, ...profile } = input;

  const existing = await User.exists({ email: profile.email });

  if (existing) {
    throw ApiError.conflict("An account with this email already exists", {
      errors: [{ field: "email", message: "Already registered" }],
    });
  }

  const assignedRole = role ?? ROLES.CUSTOMER;

  assertCanAssignRole(assignedRole, actor);

  const generatedPassword = password ? null : generatePassword();

  const user = await User.create({
    ...profile,
    password: password ?? generatedPassword,
    role: assignedRole,
    authProviders: [AUTH_PROVIDERS.EMAIL],
    status: USER_STATUS.ACTIVE,
    emailVerifiedAt: new Date(),
  });

  logger.info(
    { createdUserId: user.id, role: assignedRole, by: actor.id },
    "User created by an owner"
  );

  if (sendEmail) {
    // Non-fatal. The account already exists and is usable; failing the request
    // now would leave the caller thinking nothing was created.
    await sendMail({
      to: user.email,
      ...accountCreatedEmail({
        firstName: user.firstName,
        email: user.email,
        temporaryPassword: generatedPassword,
        role: assignedRole,
      }),
    }).catch((error) =>
      logger.error({ err: error, userId: user.id }, "Failed to send account-created email")
    );
  }

  return { user: user.toJSON(), generatedPassword };
}

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

/**
 * Paginated, filtered user list driven by a request body.
 *
 * The filter is assembled explicitly here rather than spread from the input,
 * so only the fields this function names can ever reach the database. A
 * generic "spread the body into find()" helper is the classic way an API
 * leaks documents or lets a client sort on an unindexed field.
 */
async function filterUsers(params) {
  const filter = {};

  if (params.search) {
    // Anchored, escaped prefix match on each name field plus a contains match
    // on email. A bare user-supplied regex would let a client mount a ReDoS,
    // and an unanchored `.*term.*` on every field cannot use an index at all.
    const term = escapeRegex(params.search);
    filter.$or = [
      { firstName: { $regex: `^${term}`, $options: "i" } },
      { lastName: { $regex: `^${term}`, $options: "i" } },
      { email: { $regex: term, $options: "i" } },
    ];
  }

  if (params.role) {
    filter.role = Array.isArray(params.role) ? { $in: params.role } : params.role;
  }

  if (params.status) {
    filter.status = Array.isArray(params.status) ? { $in: params.status } : params.status;
  } else if (!params.includeDeleted) {
    // Deleted accounts stay out of routine listings unless asked for.
    filter.status = { $ne: USER_STATUS.DELETED };
  }

  if (params.emailVerified !== undefined) {
    filter.emailVerifiedAt = params.emailVerified ? { $ne: null } : null;
  }

  if (params.createdFrom || params.createdTo) {
    filter.createdAt = {};
    if (params.createdFrom) filter.createdAt.$gte = params.createdFrom;
    if (params.createdTo) filter.createdAt.$lte = params.createdTo;
  }

  const sort = { [params.sortBy]: params.sortOrder === "asc" ? 1 : -1 };
  const skip = (params.page - 1) * params.limit;

  // Page and count in parallel - the count is needed for pagination metadata
  // and neither depends on the other.
  const [items, total] = await Promise.all([
    User.find(filter).sort(sort).skip(skip).limit(params.limit).lean(),
    User.countDocuments(filter),
  ]);

  return {
    items: items.map(toPublicUser),
    total,
    page: params.page,
    limit: params.limit,
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
  const user = await loadModifiableUser(targetUserId, actor);

  assertCanAssignRole(role, actor);

  // The platform must never be left without an owner.
  if (user.role === ROLES.OWNER) {
    await assertNotLastOwner(user);
  }

  user.role = role;
  // Force a re-auth so the new role takes effect on the next request rather
  // than whenever the old token happens to expire.
  user.tokenVersion += 1;
  await user.save();

  return user.toJSON();
}

/**
 * Moves an account between ACTIVE and SUSPENDED. Deletion has its own
 * endpoint, so this cannot be used to remove someone by side effect.
 */
async function updateStatus(targetUserId, status, actor) {
  const user = await loadModifiableUser(targetUserId, actor);

  if (status !== USER_STATUS.ACTIVE && user.role === ROLES.OWNER) {
    await assertNotLastOwner(user);
  }

  user.status = status;

  if (status === USER_STATUS.ACTIVE) {
    // Restoring clears the deletion stamp, so a previously removed account
    // does not keep claiming it was deleted.
    user.deletedAt = null;
  } else {
    // Suspension has to take effect now, not whenever their token expires.
    user.revokeAllSessions();
  }

  await user.save();

  return user.toJSON();
}

/**
 * Soft delete: flags the account as DELETED and ends its sessions.
 *
 * The row stays, because orders, reviews and audit trails reference it -
 * removing it would leave dangling references and rewrite history. The email
 * also stays claimed, so the address cannot be re-registered by someone else
 * and inherit the previous person's footprint.
 */
async function softDelete(targetUserId, actor) {
  const user = await loadModifiableUser(targetUserId, actor);

  if (user.status === USER_STATUS.DELETED) {
    throw ApiError.conflict("This account is already deleted");
  }

  if (user.role === ROLES.OWNER) {
    await assertNotLastOwner(user);
  }

  user.status = USER_STATUS.DELETED;
  user.deletedAt = new Date();
  user.revokeAllSessions();

  await user.save();

  logger.info({ userId: user.id, by: actor.id }, "User soft deleted");

  return user.toJSON();
}

/**
 * Hard delete: removes the document outright.
 *
 * Irreversible, and deliberately harder to reach than the soft delete - it is
 * for erasure requests and genuine mistakes, not routine offboarding. Anything
 * referencing this user by id becomes a dangling reference, which is exactly
 * why `softDelete` is the default and this is owner-only.
 */
async function hardDelete(targetUserId, actor) {
  const user = await loadModifiableUser(targetUserId, actor);

  if (user.role === ROLES.OWNER) {
    await assertNotLastOwner(user);
  }

  await user.deleteOne();

  logger.warn(
    { userId: Number(targetUserId), email: user.email, by: actor.id },
    "User permanently deleted"
  );

  return { id: Number(targetUserId), email: user.email };
}

/* -------------------------------- helpers -------------------------------- */

/**
 * Loads a user the actor is allowed to modify, applying the two rules every
 * administrative write shares: no acting on yourself, no acting on a peer or
 * a superior.
 */
async function loadModifiableUser(targetUserId, actor) {
  if (Number(targetUserId) === Number(actor.id)) {
    throw ApiError.badRequest("You cannot perform this action on your own account");
  }

  const user = await User.findById(targetUserId).select("+tokenVersion +sessions");

  if (!user) throw ApiError.notFound("User not found");

  if (roleAtLeast(user.role, actor.role) && user.role !== ROLES.CUSTOMER) {
    throw ApiError.forbidden("You cannot modify a user at or above your own role", {
      code: "INSUFFICIENT_ROLE",
    });
  }

  return user;
}

function assertCanAssignRole(role, actor) {
  if (roleRank(role) >= roleRank(actor.role)) {
    throw ApiError.forbidden(
      `You can only assign roles below your own. Available to you: ${
        assignableRoles(actor.role).join(", ") || "none"
      }`,
      { code: "ROLE_ABOVE_ACTOR" }
    );
  }
}

async function assertNotLastOwner(user) {
  const remainingOwners = await User.countDocuments({
    role: ROLES.OWNER,
    status: USER_STATUS.ACTIVE,
    _id: { $ne: user._id },
  });

  if (remainingOwners === 0) {
    throw ApiError.conflict("Cannot remove or demote the last remaining owner");
  }
}

/**
 * `.lean()` skips the schema's toJSON transform, so the sensitive fields are
 * stripped and the integer id surfaced explicitly here.
 */
function toPublicUser({
  password,
  sessions,
  tokenVersion,
  passwordChangedAt,
  passwordResetTokenHash,
  passwordResetExpiresAt,
  socialAccounts,
  __v,
  _id,
  ...rest
}) {
  return {
    id: _id,
    ...rest,
    fullName: `${rest.firstName} ${rest.lastName}`.trim(),
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  createUser,
  getById,
  updateProfile,
  filterUsers,
  updateRole,
  updateStatus,
  softDelete,
  hardDelete,
};
