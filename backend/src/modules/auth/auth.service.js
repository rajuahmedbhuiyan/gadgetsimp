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
  checkoutAccountEmail,
  welcomeEmail,
  passwordResetEmail,
  passwordChangedEmail,
} = require("./auth.emails");
const { claimGuestOrders } = require("../order/order.link");
const {
  EMAIL_VERIFICATION_TTL_MINUTES,
  PASSWORD_RESET_TTL_MINUTES,
  REGISTRATION_COMPLETION_TTL_MINUTES,
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
const SOCIAL_PLACEHOLDER_EMAIL_DOMAIN = "social.local.gadgetsimp";

/**
 * Step 1 of signup: record the details, email a token. No account yet.
 *
 * An existing account is reported explicitly so the client can take the user
 * back to the correct sign-in method instead of pretending another
 * verification email was sent.
 */
async function register({ fullName, email, password, phone }) {
  const existingUser = await User.findOne({ email }).select("authProviders").lean();

  if (existingUser) {
    throw ApiError.conflict(existingAccountMessage(existingUser), {
      code: "EMAIL_ALREADY_REGISTERED",
      errors: [{ field: "email", message: "This email is already registered" }],
    });
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
      fullName,
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
  await sendMail({ to: email, ...verificationEmail({ fullName, token }) });
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

  /**
   * The checkout branch: this signup never had a password field.
   *
   * A guest asked, mid-purchase, for an account to be created. Creating one
   * here would mean an account with no credential the customer chose - so the
   * address is marked proven, a fresh token is issued for the second step, and
   * the caller is told a password is still needed.
   *
   * Crucially **no session is issued**. Signing someone in on the strength of
   * a link that arrived by email, without them ever proving they know a
   * secret, would make a forwarded or intercepted message a login. The
   * password step is what turns a verified address into an account.
   */
  if (!pending.passwordHash) {
    const { token: registrationToken, tokenHash: registrationTokenHash } = createSecureToken();

    // Rotating the hash spends the emailed link: it cannot be replayed, and
    // only the token handed back below opens the next step.
    pending.tokenHash = registrationTokenHash;
    pending.emailVerifiedAt = new Date();
    pending.expiresAt = new Date(
      Date.now() + REGISTRATION_COMPLETION_TTL_MINUTES * 60 * 1000
    );
    await pending.save();

    return {
      outcome: "REQUIRED_PASSWORD",
      registrationToken,
      email: pending.email,
      fullName: pending.fullName,
    };
  }

  const user = await User.create({
    fullName: pending.fullName,
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

  await afterAccountCreated(user);

  // Signing them in here is the point of verifying: the user clicked the link
  // seconds ago, so making them type the password again adds nothing.
  return { outcome: "SESSION", ...(await issueSession(user, context)) };
}

/**
 * Step 2 of the checkout signup: the password finally arrives.
 *
 * Reached only after `verifyEmail` has proven the address and handed back a
 * `registrationToken`. The account is created here, and no second verification
 * email is sent - the address was confirmed minutes ago and asking again would
 * be theatre.
 */
async function completeRegistration({ token, password }, context = {}) {
  const tokenHash = hashToken(token);

  const pending = await PendingRegistration.findOne({ tokenHash });

  if (!pending) {
    throw ApiError.badRequest("This link is invalid or has already been used.", {
      code: "REGISTRATION_TOKEN_INVALID",
    });
  }

  /**
   * The check that makes the two-step flow safe.
   *
   * Without it, the token from the *verification email* could be spent
   * directly here - creating an account while skipping the verification step
   * that token was issued to perform. Requiring the address to already be
   * proven forces the intended order, and means this endpoint can only ever be
   * reached with the rotated token that `verifyEmail` handed back.
   */
  if (!pending.emailVerifiedAt) {
    throw ApiError.badRequest("Confirm your email address before choosing a password.", {
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  // A normal signup already carries a password and becomes an account the
  // moment its link is clicked, so it has no business here.
  if (pending.passwordHash) {
    throw ApiError.badRequest("This account already has a password. Please sign in.", {
      code: "PASSWORD_ALREADY_SET",
    });
  }

  if (pending.expiresAt.getTime() <= Date.now()) {
    await pending.deleteOne();

    throw ApiError.badRequest(
      "This link has expired. Please use the forgot-password flow to set a password.",
      { code: "REGISTRATION_TOKEN_EXPIRED" }
    );
  }

  const alreadyExists = await User.exists({ email: pending.email });

  if (alreadyExists) {
    await pending.deleteOne();

    throw ApiError.conflict("An account with this email already exists. Please sign in.", {
      code: "EMAIL_ALREADY_REGISTERED",
    });
  }

  const user = await User.create({
    fullName: pending.fullName,
    email: pending.email,
    phone: pending.phone,
    password,
    // Carried over from the verification step rather than stamped now, so the
    // record says when the address was actually proven.
    emailVerifiedAt: pending.emailVerifiedAt,
  });

  await pending.deleteOne();

  await afterAccountCreated(user);

  return issueSession(user, context);
}

/**
 * Everything that happens once an account exists, whichever path created it.
 *
 * Both side effects are non-fatal on purpose: the account is already created,
 * and failing the request now would tell the user their signup did not work
 * when it did - leaving them retrying against an address that is already taken.
 */
async function afterAccountCreated(user) {
  await claimGuestOrders(user.email, user._id).catch((error) =>
    logger.error({ err: error, userId: user._id }, "Failed to claim guest orders")
  );

  await sendMail({ to: user.email, ...welcomeEmail({ fullName: user.fullName }) }).catch(
    (error) => logger.error({ err: error }, "Failed to send welcome email")
  );
}

/**
 * Invites a guest who has just checked out to turn the purchase into an
 * account.
 *
 * Records the signup without a password - see `pendingRegistration.model` -
 * and emails a confirmation link. The order is already placed by the time this
 * runs and does not depend on it, which is why every failure path here returns
 * a reason instead of throwing: a mail outage must not undo a completed
 * purchase.
 *
 * @returns {Promise<{invited: boolean, reason?: string}>}
 */
async function inviteAccountFromCheckout({ email, name, phone, orderNumber }) {
  const existing = await User.exists({ email });

  // Already has an account. Silently doing nothing is right: they can simply
  // sign in, and sending a "you already have an account" note to an address
  // supplied by whoever placed the order would let checkout be used to mail
  // strangers.
  if (existing) return { invited: false, reason: "ACCOUNT_EXISTS" };

  // Checkout collects one name field and so does the account, so it carries
  // straight over - no splitting on a guess and reassembling it wrongly.
  const fullName = String(name ?? "").trim() || "Customer";
  const { token, tokenHash } = createSecureToken();

  await PendingRegistration.findOneAndUpdate(
    { email },
    {
      $set: {
        email,
        fullName,
        phone,
        tokenHash,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000),
        lastSentAt: new Date(),
        resendCount: 0,
        emailVerifiedAt: null,
      },
      // An earlier abandoned signup for this address may have left a password
      // behind. Leaving it would send this row down the one-step path and
      // create an account with a credential the customer no longer remembers
      // choosing.
      $unset: { passwordHash: "" },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  await sendMail({
    to: email,
    ...checkoutAccountEmail({ fullName, orderNumber, token }),
  });

  return { invited: true };
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
    ...verificationEmail({ fullName: pending.fullName, token }),
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
 *   1. **Known provider id** - a returning social-only user. Sign them in.
 *   2. **Known email** - refuse an email/password account; otherwise link the
 *      additional social provider rather than creating a duplicate account.
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
    assertSocialSignInAllowed(byProviderId);
    assertCanSignIn(byProviderId);
    byProviderId.lastLoginAt = new Date();
    return issueSession(byProviderId, context);
  }

  const profileEmail = profile.email ?? fallbackSocialEmail(profile);

  // 2. Existing account for the same email. Password accounts stay strictly
  // email/password accounts; possession of a matching Google/Facebook email
  // must not silently add a new sign-in method. Social-only accounts may link
  // another social provider, preserving the one-user-per-email constraint.
  const byEmail = await User.findOne({ email: profileEmail }).select(
    "+tokenVersion +sessions +socialAccounts"
  );

  if (byEmail) {
    assertSocialSignInAllowed(byEmail);
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
    if (profile.email) byEmail.emailVerifiedAt ??= new Date();
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
    fullName: profile.fullName,
    email: profileEmail,
    socialAccounts: [{ provider: profile.provider, providerId: profile.providerId }],
    authProviders: [profile.provider],
    image: profile.avatarUrl ?? undefined,
    emailVerifiedAt: profile.email ? new Date() : null,
    lastLoginAt: new Date(),
  });

  // A pending email signup for the same address is now redundant.
  if (profile.email) await PendingRegistration.deleteOne({ email: profile.email });

  // Same follow-up as any other new account, including claiming guest orders:
  // the provider verified this address, which is the same bar the email flow
  // clears before it claims anything.
  if (profile.email) await afterAccountCreated(user);

  return issueSession(user, context);
}

function fallbackSocialEmail(profile) {
  if (profile.provider !== AUTH_PROVIDERS.FACEBOOK) {
    const reason =
      profile.emailMissingReason === "account"
        ? `${titleCase(profile.provider)} did not return an email address for this account. Add or verify an email, or sign up with your email instead.`
        : `${titleCase(profile.provider)} did not share an email address with us. Please grant email permission, or sign up with your email instead.`;

    throw ApiError.badRequest(reason, { code: "SOCIAL_EMAIL_MISSING" });
  }

  const providerId = String(profile.providerId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 120);

  return `facebook-${providerId}@${SOCIAL_PLACEHOLDER_EMAIL_DOMAIN}`;
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

function assertSocialSignInAllowed(user) {
  if (!user.hasProvider(AUTH_PROVIDERS.EMAIL)) return;

  throw ApiError.conflict(
    "This account was created with email and password. Please sign in with your email and password.",
    {
      code: "EMAIL_LOGIN_REQUIRED",
      errors: [{ field: "email", message: "Sign in with email and password" }],
    }
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

  // A social-only account has no email password to compare. Tell the client
  // which button to show instead of presenting an unhelpful wrong-password
  // error for a credential that can never exist.
  if (!user.password) {
    throw ApiError.unauthorized(socialLoginRequiredMessage(user), {
      code: "SOCIAL_LOGIN_REQUIRED",
      errors: [{ field: "email", message: socialProviderInstruction(user) }],
    });
  }

  const passwordMatches = await user.comparePassword(password);

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
 * Unknown addresses and social-only accounts are reported explicitly so the
 * client can distinguish a typo from an account that must use Google or
 * Facebook. A reset link is sent only to an account that already has an email
 * password.
 */
async function forgotPassword(email) {
  const user = await User.findOne({ email }).select("+tokenVersion");

  if (!user) {
    throw ApiError.notFound("No account is registered with this email address.", {
      code: "ACCOUNT_NOT_FOUND",
      errors: [{ field: "email", message: "No account is registered with this email" }],
    });
  }

  assertCanSignIn(user);

  if (!user.hasProvider(AUTH_PROVIDERS.EMAIL)) {
    throw ApiError.conflict(socialPasswordResetMessage(user), {
      code: "SOCIAL_LOGIN_REQUIRED",
      errors: [{ field: "email", message: socialProviderInstruction(user) }],
    });
  }

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
    ...passwordResetEmail({ fullName: user.fullName, token }),
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
    ...passwordChangedEmail({ fullName: user.fullName }),
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
      `This account signs in with ${providerNames(user)} and has no password to change.`,
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
    ...passwordChangedEmail({ fullName: user.fullName }),
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

function socialProviders(user) {
  return (user.authProviders ?? []).filter((provider) => provider !== AUTH_PROVIDERS.EMAIL);
}

function providerNames(user) {
  const names = socialProviders(user).map(titleCase);

  if (names.length <= 1) return names[0] ?? "your social provider";
  return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

function socialProviderInstruction(user) {
  return `Continue with ${providerNames(user)}`;
}

function socialLoginRequiredMessage(user) {
  const providers = providerNames(user);
  return `This account was created with ${providers} and does not have an email password. Please continue with ${providers}.`;
}

function socialPasswordResetMessage(user) {
  const providers = providerNames(user);
  return `This account uses ${providers} sign-in and has no password to reset. Please continue with ${providers}.`;
}

function existingAccountMessage(user) {
  if (user.authProviders?.includes(AUTH_PROVIDERS.EMAIL)) {
    return "An account with this email already exists. Please sign in with your email and password.";
  }

  return `An account with this email already exists. ${socialProviderInstruction(user)}.`;
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
  completeRegistration,
  inviteAccountFromCheckout,
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
