"use strict";

const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const User = require("../user/user.model");
const PendingRegistration = require("./pendingRegistration.model");
const ApiError = require("../../shared/ApiError");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  parseDuration,
} = require("../../shared/tokens");
const env = require("../../config/env");
const logger = require("../../config/logger");
const { sendMail } = require("../../config/mailer");
const {
  verificationEmail,
  welcomeEmail,
  existingAccountEmail,
  passwordResetEmail,
  passwordChangedEmail,
} = require("./auth.emails");
const {
  EMAIL_VERIFICATION_TTL_MINUTES,
  PASSWORD_RESET_TTL_MINUTES,
  AUTH_PROVIDERS,
  USER_STATUS,
} = require("../../shared/constants");
const { getProvider } = require("./providers");

/**
 * Auth business logic.
 *
 * Services know nothing about `req` or `res` - they take plain arguments and
 * return plain data or throw `ApiError`. That is what lets the same `login()`
 * be called from an HTTP controller today and from a CLI script, a queue
 * worker or a test without a fake request object.
 */

const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_RESENDS = 5;

/**
 * Step 1 of signup: record the details, email a token. No account yet.
 *
 * Returns nothing the caller can act on, and the controller answers with the
 * same message whether or not the address was already taken. Replying "that
 * email is registered" would turn signup into an account-enumeration oracle -
 * exactly the leak the login route is careful to avoid, and it would be
 * pointless to close one and leave the other open.
 */
async function register({ firstName, lastName, email, password, phone }) {
  const existingUser = await User.findOne({ email }).select("firstName").lean();

  if (existingUser) {
    // Tell the real owner of the address that someone tried, rather than
    // telling the person who tried. If it was them, this is the nudge they
    // need; if it was not, they learn their address is in use here.
    //
    // Addressed with the *account holder's* name, not the one just submitted -
    // otherwise the notice hands a stranger's chosen name to the real owner,
    // and lets a signup attempt put arbitrary text in someone else's inbox.
    await notifyExistingAccount({
      email,
      firstName: existingUser.firstName,
    }).catch((error) =>
      logger.error({ err: error }, "Failed to send existing-account notice")
    );
    return;
  }

  const { token, tokenHash } = createSecureToken();
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000);

  // Upsert: signing up twice before verifying should replace the pending row
  // and re-send, not collide on the unique email index.
  await PendingRegistration.findOneAndUpdate(
    { email },
    {
      email,
      firstName,
      lastName,
      phone,
      passwordHash,
      tokenHash,
      expiresAt,
      lastSentAt: new Date(),
      // A fresh signup starts the resend budget over. Set explicitly rather
      // than via $inc, which would conflict with setDefaultsOnInsert on the
      // same path.
      resendCount: 0,
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  // Awaited, not fire-and-forget: if the mail cannot be handed off there is no
  // way for the user to ever complete signup, so that must fail the request.
  await sendMail({ to: email, ...verificationEmail({ firstName, token }) });
}

/**
 * Step 2 of signup: the token comes back, and only now is the account created.
 */
async function verifyEmail(token, context = {}) {
  const tokenHash = hashToken(token);

  const pending = await PendingRegistration.findOne({ tokenHash });

  if (!pending) {
    throw ApiError.badRequest(
      "This verification link is invalid or has already been used.",
      { code: "VERIFICATION_TOKEN_INVALID" }
    );
  }

  // Checked here rather than relying on the TTL index: Mongo's TTL monitor
  // only sweeps about once a minute, so an expired row can still be readable.
  // The explicit check is what makes the window exact.
  if (pending.expiresAt.getTime() <= Date.now()) {
    await pending.deleteOne();
    throw ApiError.badRequest(
      `This verification link has expired - links are valid for ${EMAIL_VERIFICATION_TTL_MINUTES} minutes. Please sign up again to get a new one.`,
      { code: "VERIFICATION_TOKEN_EXPIRED" }
    );
  }

  // Someone may have registered this address through another route between
  // the email being sent and the link being clicked.
  const alreadyExists = await User.exists({ email: pending.email });

  if (alreadyExists) {
    await pending.deleteOne();
    throw ApiError.conflict("An account with this email already exists. Please sign in.", {
      code: "EMAIL_ALREADY_REGISTERED",
    });
  }

  const user = await User.create({
    firstName: pending.firstName,
    lastName: pending.lastName,
    email: pending.email,
    phone: pending.phone,
    // Already a bcrypt digest; the model's save hook detects that and does
    // not hash it a second time.
    password: pending.passwordHash,
    emailVerifiedAt: new Date(),
  });

  // The token is single-use: consuming the pending row is what makes a
  // replayed link fail with VERIFICATION_TOKEN_INVALID.
  await pending.deleteOne();

  await sendMail({ to: user.email, ...welcomeEmail({ firstName: user.firstName }) }).catch(
    (error) => logger.error({ err: error }, "Failed to send welcome email")
  );

  // Signing them in here is the point of verifying: the user clicked the link
  // seconds ago, so making them type the password again adds nothing.
  return issueSession(user, context);
}

/**
 * Re-sends the verification email for a pending signup.
 */
async function resendVerification(email) {
  const pending = await PendingRegistration.findOne({ email });

  // Silent success for an unknown address, for the same enumeration reason.
  if (!pending) return;

  const sinceLast = Date.now() - pending.lastSentAt.getTime();

  if (sinceLast < RESEND_COOLDOWN_MS) {
    throw ApiError.tooManyRequests(
      `Please wait ${Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000)} seconds before requesting another email.`,
      { code: "RESEND_COOLDOWN" }
    );
  }

  if (pending.resendCount >= MAX_RESENDS) {
    throw ApiError.tooManyRequests(
      "Too many verification emails requested. Please sign up again later.",
      { code: "RESEND_LIMIT_REACHED" }
    );
  }

  // A fresh token each time, so links from earlier emails stop working and a
  // forwarded or intercepted old message cannot be used.
  const { token, tokenHash } = createSecureToken();

  pending.tokenHash = tokenHash;
  pending.expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000);
  pending.lastSentAt = new Date();
  pending.resendCount += 1;
  await pending.save();

  await sendMail({
    to: pending.email,
    ...verificationEmail({ firstName: pending.firstName, token }),
  });
}

/**
 * Social sign-in, one path for every provider.
 *
 * The provider registry hands back a normalised profile, so nothing below
 * knows or cares whether this was Facebook or Google. One endpoint covers
 * both "sign up" and "sign in" because, from the user's point of view, there
 * is no difference - they tap a button and expect to end up signed in.
 *
 * Three cases, in priority order:
 *
 *   1. **Known provider id** - a returning social user. Sign them in.
 *   2. **Known email** - they already have an account. Link this provider to
 *      it rather than creating a second account for the same person.
 *   3. **Neither** - create the account. No email-verification step: the
 *      provider has already verified the address, which is the whole point of
 *      delegating identity to them.
 *
 * Case 2 is only safe because the providers verify email ownership before
 * releasing an address (and the Google adapter rejects `email_verified:
 * false` outright). Without that guarantee this would be an account-takeover
 * primitive: claim victim@example.com at the provider, sign in here, inherit
 * their orders.
 *
 * @param {string} type FACEBOOK | GOOGLE
 * @param {string} token Provider token - access token for Facebook, ID token for Google.
 */
async function socialLogin(type, token, context = {}) {
  const provider = getProvider(type);
  const profile = await provider.verifyToken(token);

  // 1. Returning social user.
  const byProviderId = await User.findOne({
    socialAccounts: {
      $elemMatch: { provider: profile.provider, providerId: profile.providerId },
    },
  }).select("+tokenVersion +sessions +socialAccounts");

  if (byProviderId) {
    assertCanSignIn(byProviderId);
    byProviderId.lastLoginAt = new Date();
    return issueSession(byProviderId, context);
  }

  // A provider does not always release an email - a Facebook user may have
  // registered by phone, or declined the permission. Without one there is no
  // way to link or contact the account, so fall back to email signup.
  if (!profile.email) {
    throw ApiError.badRequest(
      `${titleCase(type)} did not share an email address with us. Please grant email permission, or sign up with your email instead.`,
      { code: "SOCIAL_EMAIL_MISSING" }
    );
  }

  // 2. Existing account for the same person - link, do not duplicate.
  const byEmail = await User.findOne({ email: profile.email }).select(
    "+tokenVersion +sessions +socialAccounts"
  );

  if (byEmail) {
    assertCanSignIn(byEmail);

    byEmail.socialAccounts.push({
      provider: profile.provider,
      providerId: profile.providerId,
      linkedAt: new Date(),
    });

    if (!byEmail.authProviders.includes(profile.provider)) {
      byEmail.authProviders.push(profile.provider);
    }

    // Signing in through a provider proves the address, so an account that
    // never completed email verification is confirmed by this.
    byEmail.emailVerifiedAt ??= new Date();
    byEmail.image ??= profile.avatarUrl ?? undefined;
    byEmail.lastLoginAt = new Date();

    logger.info(
      { userId: byEmail.id, provider: profile.provider },
      "Linked a social account to an existing user"
    );

    return issueSession(byEmail, context);
  }

  // 3. Brand new account. No password, and no verification email.
  const user = await User.create({
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    socialAccounts: [{ provider: profile.provider, providerId: profile.providerId }],
    authProviders: [profile.provider],
    image: profile.avatarUrl ?? undefined,
    emailVerifiedAt: new Date(),
    lastLoginAt: new Date(),
  });

  // A pending email signup for the same address is now redundant.
  await PendingRegistration.deleteOne({ email: profile.email });

  await sendMail({ to: user.email, ...welcomeEmail({ firstName: user.firstName }) }).catch(
    (error) => logger.error({ err: error }, "Failed to send welcome email")
  );

  return issueSession(user, context);
}

/**
 * One place decides whether an account may hold a session, so a suspended and
 * a deleted account cannot drift into being treated differently by accident.
 */
function assertCanSignIn(user) {
  if (user.canSignIn()) return;

  throw ApiError.forbidden(
    user.status === USER_STATUS.DELETED
      ? "This account no longer exists"
      : "This account has been suspended",
    { code: "ACCOUNT_DISABLED" }
  );
}

function titleCase(value) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

async function login({ email, password }, context = {}) {
  // `+password` is needed because the field is `select: false` on the schema.
  const user = await User.findOne({ email }).select("+password +tokenVersion +sessions");

  // One message and one code for both "no such user" and "wrong password".
  // Distinguishing them turns the login route into an account-enumeration
  // oracle. The password comparison still runs against a dummy hash when the
  // user is missing so the response time does not give the answer away either.
  if (!user) {
    await burnTimingBudget();
    throw ApiError.unauthorized("Invalid email or password", { code: "INVALID_CREDENTIALS" });
  }

  const passwordMatches = await user.comparePassword(password);

  // Also the path a Facebook-only account takes: `comparePassword` returns
  // false when there is no stored hash, so it fails here with the same
  // generic message - which is correct, since revealing "this address signs
  // in with Facebook" would leak that the account exists.
  if (!passwordMatches) {
    throw ApiError.unauthorized("Invalid email or password", { code: "INVALID_CREDENTIALS" });
  }

  assertCanSignIn(user);

  user.lastLoginAt = new Date();

  return issueSession(user, context);
}

/**
 * Exchanges a refresh token for a new pair, rotating the old one.
 *
 * Rotation is what makes theft detectable: the presented token must match a
 * stored session hash, and using it consumes it. A stolen token replayed
 * after the legitimate client has already refreshed will not match anything,
 * and the mismatch is treated as compromise - every session is dropped.
 */
async function refresh(refreshToken, context = {}) {
  if (!refreshToken) {
    throw ApiError.unauthorized("Refresh token missing", { code: "REFRESH_TOKEN_MISSING" });
  }

  const payload = verifyRefreshToken(refreshToken);

  const user = await User.findById(payload.sub).select("+tokenVersion +sessions");

  if (!user || !user.canSignIn()) {
    throw ApiError.unauthorized("Session is no longer valid", { code: "SESSION_INVALID" });
  }

  if (user.tokenVersion !== payload.tokenVersion) {
    throw ApiError.unauthorized("Session has been revoked. Please sign in again.", {
      code: "TOKEN_REVOKED",
    });
  }

  user.pruneExpiredSessions();

  const presentedHash = hashToken(refreshToken);
  const matchedSession = user.sessions.find((session) => session.tokenHash === presentedHash);

  if (!matchedSession) {
    // Valid signature, unknown session: the token was already rotated away,
    // which means someone is replaying a captured one. Assume the worst.
    user.tokenVersion += 1;
    user.sessions = [];
    await user.save();

    throw ApiError.unauthorized("Session reuse detected. All sessions have been signed out.", {
      code: "REFRESH_TOKEN_REUSED",
    });
  }

  user.removeSessionByJti(matchedSession.jti);

  return issueSession(user, context);
}

async function logout(refreshToken, userId) {
  if (!refreshToken) return;

  const user = await User.findById(userId).select("+sessions");
  if (!user) return;

  user.removeSessionByJti(safeJti(refreshToken));
  await user.save();
}

/**
 * Signs out every device by bumping `tokenVersion`, which invalidates
 * outstanding access tokens as well as stored refresh sessions.
 */
async function logoutAll(userId) {
  const user = await User.findById(userId).select("+tokenVersion +sessions");
  if (!user) return;

  user.tokenVersion += 1;
  user.sessions = [];
  await user.save();
}

/**
 * Step 1 of password recovery: email a single-use reset link.
 *
 * Returns nothing and never reveals whether the address exists - the same
 * enumeration reasoning as login and signup. A caller who could tell "no
 * account" from "email sent" would have a free membership oracle.
 *
 * A social-only account may reset too: they own the address, and the flow
 * gives them a password to sign in with alongside Facebook or Google. That
 * adds EMAIL to their providers rather than replacing anything.
 */
async function forgotPassword(email) {
  const user = await User.findOne({ email }).select("+tokenVersion");

  // Silent success for an unknown or deactivated account.
  if (!user || !user.canSignIn()) return;

  const { token, tokenHash } = createSecureToken();

  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpiresAt = new Date(
    Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000
  );

  // Issuing a new link invalidates any previous one, because the stored hash
  // is overwritten - so a forwarded older email stops working.
  await user.save();

  await sendMail({
    to: user.email,
    ...passwordResetEmail({ firstName: user.firstName, token }),
  });
}

/**
 * Step 2: consume the token and set the new password.
 */
async function resetPassword({ token, newPassword }) {
  const tokenHash = hashToken(token);

  const user = await User.findOne({ passwordResetTokenHash: tokenHash }).select(
    "+password +tokenVersion +sessions +passwordResetTokenHash +passwordResetExpiresAt"
  );

  if (!user) {
    throw ApiError.badRequest("This reset link is invalid or has already been used.", {
      code: "RESET_TOKEN_INVALID",
    });
  }

  // Checked explicitly rather than trusting a background sweep, so the window
  // is exactly what the email advertised.
  if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() <= Date.now()) {
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();

    throw ApiError.badRequest(
      `This reset link has expired - links are valid for ${PASSWORD_RESET_TTL_MINUTES} minutes. Please request a new one.`,
      { code: "RESET_TOKEN_EXPIRED" }
    );
  }

  assertCanSignIn(user);

  user.password = newPassword;

  // Single use: clearing the hash is what makes a replayed link fail.
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;

  // A reset is the usual response to a suspected compromise, so ending every
  // other session is the entire point.
  user.revokeAllSessions();

  // A social-only account that sets a password gains EMAIL as a sign-in method.
  if (!user.authProviders.includes(AUTH_PROVIDERS.EMAIL)) {
    user.authProviders.push(AUTH_PROVIDERS.EMAIL);
  }

  await user.save();

  // Sent on every change, not only user-initiated ones: this is the message
  // that lets a victim notice a takeover. Non-fatal - the reset already
  // succeeded, and failing the request now would be misleading.
  await sendMail({
    to: user.email,
    ...passwordChangedEmail({ firstName: user.firstName }),
  }).catch((error) => logger.error({ err: error }, "Failed to send password-changed notice"));
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select("+password +tokenVersion +sessions");

  if (!user) throw ApiError.notFound("Account not found");

  // A Facebook-only account has no password to change. Running the normal
  // flow would compare against an undefined hash and report "incorrect
  // current password", which is both wrong and impossible to act on.
  if (!user.hasProvider(AUTH_PROVIDERS.EMAIL)) {
    throw ApiError.badRequest(
      "This account signs in with Facebook and has no password to change.",
      { code: "PASSWORD_NOT_SET" }
    );
  }

  const matches = await user.comparePassword(currentPassword);

  if (!matches) {
    throw ApiError.unauthorized("Current password is incorrect", {
      code: "INVALID_CREDENTIALS",
      errors: [{ field: "currentPassword", message: "Incorrect password" }],
    });
  }

  user.password = newPassword;

  // A password change must end sessions elsewhere - that is the whole point
  // of changing it after a suspected compromise.
  user.revokeAllSessions();

  await user.save();

  await sendMail({
    to: user.email,
    ...passwordChangedEmail({ firstName: user.firstName }),
  }).catch((error) => logger.error({ err: error }, "Failed to send password-changed notice"));
}

/**
 * Mints an access/refresh pair and records the session on the user.
 */
async function issueSession(user, { userAgent, ip } = {}) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, jti } = signRefreshToken(user);

  user.addSession({
    tokenHash: hashToken(refreshToken),
    jti,
    userAgent: userAgent?.slice(0, 255),
    ip,
    expiresAt: new Date(Date.now() + parseDuration(env.JWT_REFRESH_EXPIRES_IN)),
  });

  await user.save();

  return { user: user.toJSON(), accessToken, refreshToken };
}

/**
 * 32 random bytes, delivered raw in the email and stored only as a hash.
 * base64url keeps it URL-safe without percent-encoding. Shared by email
 * verification and password reset - both are single-use emailed credentials.
 */
function createSecureToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

async function notifyExistingAccount({ email, firstName }) {
  await sendMail({ to: email, ...existingAccountEmail({ firstName }) });
}

function safeJti(refreshToken) {
  try {
    return verifyRefreshToken(refreshToken).jti;
  } catch {
    return null;
  }
}

// A bcrypt comparison against a throwaway hash, so a missing account costs
// roughly the same wall-clock time as a wrong password.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.9OQGSwGxN.9xvUKz1MQqYqPz3s0Rmoe";

async function burnTimingBudget() {
  await bcrypt.compare("timing-safe-placeholder", DUMMY_HASH);
}

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  socialLogin,
  login,
  forgotPassword,
  resetPassword,
  refresh,
  logout,
  logoutAll,
  changePassword,
};
