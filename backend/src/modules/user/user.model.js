"use strict";

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const env = require("../../config/env");
const {
  ROLE_VALUES,
  ROLES,
  AUTH_PROVIDERS,
  AUTH_PROVIDER_VALUES,
  SOCIAL_PROVIDERS,
  USER_STATUS,
  USER_STATUS_VALUES,
  SIGN_IN_ALLOWED_STATUSES,
} = require("../../shared/constants");
const { nextSequence } = require("../../shared/sequence");

/**
 * Refresh sessions are embedded rather than kept in their own collection.
 * They are always read with the user, never queried independently, and are
 * bounded by MAX_SESSIONS - which is exactly the case embedding is for.
 */
const sessionSchema = new mongoose.Schema(
  {
    // Only the hash is stored: a leaked database dump yields no usable tokens.
    tokenHash: { type: String, required: true },
    jti: { type: String, required: true },
    userAgent: { type: String, maxlength: 255 },
    ip: { type: String, maxlength: 64 },
    expiresAt: { type: Date, required: true },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } }
);

const userSchema = new mongoose.Schema(
  {
    // Integer primary key from the `user` sequence, assigned in the pre-save
    // hook below. Declaring `_id` as a Number replaces Mongo's default
    // ObjectId entirely rather than sitting alongside it as a second key.
    _id: { type: Number },

    /**
     * One name field rather than a first/last pair.
     *
     * A mononym is ordinary in Bangladesh and much of the world, so a required
     * surname forces either a lie or a placeholder - and a name that arrives
     * from a social provider or a checkout form is a single string anyway.
     * Storing what the user actually typed avoids splitting it on a guess and
     * reassembling it wrongly.
     */
    fullName: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
    },
    /**
     * `select: false` keeps the hash out of every query result by default, so
     * it cannot be leaked by a handler that forgets to project it away.
     *
     * Optional, because a Facebook-only account has no password at all.
     * Required only when EMAIL is one of the account's providers - storing a
     * dummy hash for social users instead would create a credential nobody
     * chose and nobody can rotate.
     */
    password: {
      type: String,
      required: [
        function passwordRequired() {
          return this.authProviders?.includes(AUTH_PROVIDERS.EMAIL);
        },
        "Password is required",
      ],
      select: false,
    },

    /**
     * Every way this account can sign in. Email/password accounts contain
     * EMAIL only; a social-only account may contain both FACEBOOK and GOOGLE.
     */
    authProviders: {
      type: [{ type: String, enum: AUTH_PROVIDER_VALUES }],
      default: [AUTH_PROVIDERS.EMAIL],
      validate: {
        validator: (providers) => providers.length > 0,
        message: "An account must have at least one sign-in method",
      },
    },

    /**
     * Linked social identities. An array rather than a `facebookId` /
     * `googleId` pair so a new provider needs no schema change, and one
     * person can link both.
     *
     * `providerId` is the provider's own subject id (Facebook's app-scoped
     * user id, Google's `sub`) - stable for that account, and meaningless
     * outside it.
     */
    socialAccounts: {
      type: [
        {
          _id: false,
          provider: { type: String, enum: SOCIAL_PROVIDERS, required: true },
          providerId: { type: String, required: true },
          linkedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
      select: false,
    },

    // Never settable from a request body: the registration and profile
    // validators omit `role` entirely, so the only way it changes is through
    // the admin-only service method, which additionally refuses to grant a
    // role at or above the actor's own rank.
    role: {
      type: String,
      enum: ROLE_VALUES,
      default: ROLES.CUSTOMER,
    },

    phone: { type: String, trim: true, maxlength: 32 },
    image: { type: String, trim: true, maxlength: 512 },

    status: {
      type: String,
      enum: USER_STATUS_VALUES,
      default: USER_STATUS.ACTIVE,
      index: true,
    },

    // Set by the soft delete, cleared if the account is restored. Kept
    // separate from `status` so "when was this removed" survives a later
    // status change, which matters for support and audit.
    deletedAt: { type: Date, default: null },

    // Always set on creation: an account only exists once its email has been
    // verified, so there is no unverified-user state to represent.
    emailVerifiedAt: { type: Date, default: null },

    /**
     * Password reset. Only the SHA-256 of the token is stored - the raw value
     * exists solely in the email - so a database dump cannot be used to seize
     * accounts. Same reasoning as refresh tokens and verification tokens.
     */
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },

    // Bumping this invalidates every access token already issued to the user.
    tokenVersion: { type: Number, default: 0, select: false },
    sessions: { type: [sessionSchema], default: [], select: false },
    passwordChangedAt: { type: Date, select: false },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    // Suppress Mongoose's built-in `id` virtual, which stringifies `_id`.
    // Ours (below) returns the integer; without this, the built-in wins and
    // clients receive "1001" instead of 1001.
    id: false,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        // Last line of defence: even if a query explicitly selects these,
        // they never reach a response body.
        delete ret.password;
        delete ret.sessions;
        delete ret.tokenVersion;
        delete ret.passwordChangedAt;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpiresAt;
        // Provider ids are internal join keys; the client only needs to know
        // *which* providers are linked, which `authProviders` already says.
        delete ret.socialAccounts;
        delete ret.__v;
        // `id` is the integer `_id`, exposed by the virtual below.
        delete ret._id;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// The default `id` virtual stringifies `_id`. Users are keyed by integer, and
// a client that receives "1000" instead of 1000 will eventually compare it
// against a number and get it wrong.
userSchema.virtual("id").get(function id() {
  return this._id;
});

// The unique index backing `email` is declared by `unique: true` on the field
// itself. It serves both the uniqueness guarantee and the by-email lookup
// every login performs.
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ fullName: 1 });

/**
 * The lookup every social sign-in performs, and the constraint that stops one
 * provider account being linked to two local users.
 *
 * `partialFilterExpression` is what makes `unique` safe here: without it,
 * every password-only account has an empty `socialAccounts` array and they
 * would all collide on the same missing key.
 */
userSchema.index(
  { "socialAccounts.provider": 1, "socialAccounts.providerId": 1 },
  {
    unique: true,
    partialFilterExpression: { "socialAccounts.provider": { $exists: true } },
  }
);

const MAX_SESSIONS = 5;

userSchema.pre("save", async function assignId() {
  if (this.isNew && this._id == null) {
    this._id = await nextSequence("user");
  }
});

// Mongoose 9 middleware does not receive a `next` callback - a hook signals
// completion by returning (or by returning a promise) and failure by throwing.
userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;

  // The signup flow hashes ahead of time, so the value may already be a
  // bcrypt digest. Re-hashing it would make the password unusable.
  if (isBcryptHash(this.password)) return;

  this.password = await bcrypt.hash(this.password, env.BCRYPT_ROUNDS);

  // Backdated a second so a token issued in the same tick as the change is
  // not mistakenly treated as pre-dating it.
  if (!this.isNew) this.passwordChangedAt = new Date(Date.now() - 1000);
});

function isBcryptHash(value) {
  return typeof value === "string" && /^\$2[aby]\$\d{2}\$.{53}$/.test(value);
}

/**
 * Returns false for an account with no password (Facebook-only) rather than
 * letting bcrypt.compare throw on an undefined hash.
 */
userSchema.methods.comparePassword = async function comparePassword(candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.hasProvider = function hasProvider(provider) {
  return this.authProviders?.includes(provider) ?? false;
};

/**
 * Whether this account may hold a session. Everything that used to ask
 * `isActive` asks this instead, so the rule lives in one place rather than
 * being re-derived - slightly differently - at each call site.
 */
userSchema.methods.canSignIn = function canSignIn() {
  return SIGN_IN_ALLOWED_STATUSES.includes(this.status);
};

userSchema.virtual("isDeleted").get(function isDeleted() {
  return this.status === USER_STATUS.DELETED;
});

/**
 * Ends every session and invalidates every outstanding access token. Used
 * wherever a credential changes - password reset, password change, admin
 * deactivation - because that is precisely when other devices must stop.
 */
userSchema.methods.revokeAllSessions = function revokeAllSessions() {
  this.tokenVersion += 1;
  this.sessions = [];
};

/**
 * Records a refresh session, evicting the oldest once the device cap is hit
 * so the document cannot grow without bound.
 */
userSchema.methods.addSession = function addSession(session) {
  this.sessions.push(session);

  if (this.sessions.length > MAX_SESSIONS) {
    this.sessions = this.sessions.slice(-MAX_SESSIONS);
  }
};

userSchema.methods.removeSessionByJti = function removeSessionByJti(jti) {
  const before = this.sessions.length;
  this.sessions = this.sessions.filter((session) => session.jti !== jti);
  return this.sessions.length < before;
};

/**
 * Drops sessions that have already expired. Called on refresh so the array
 * self-cleans without a scheduled job.
 */
userSchema.methods.pruneExpiredSessions = function pruneExpiredSessions() {
  const now = Date.now();
  this.sessions = this.sessions.filter((session) => session.expiresAt.getTime() > now);
};

const User = mongoose.model("User", userSchema);

module.exports = User;
