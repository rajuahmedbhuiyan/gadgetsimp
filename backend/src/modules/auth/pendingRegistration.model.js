"use strict";

const mongoose = require("mongoose");
const { EMAIL_VERIFICATION_TTL_MINUTES } = require("../../shared/constants");

/**
 * A signup that has been submitted but not yet confirmed.
 *
 * Because an account is only created *after* the email is verified, the
 * submitted details have to live somewhere in the meantime - and that
 * somewhere is deliberately not the users collection. Keeping unverified
 * signups out of `users` means:
 *
 *   - every row in `users` is a real, reachable person, so `countDocuments`
 *     is a true user count and admin lists are not full of ghosts;
 *   - no half-account can log in, be assigned a role, or be emailed;
 *   - abandoned signups evaporate on their own via the TTL index below,
 *     instead of accumulating forever and squatting on email addresses.
 *
 * The password is stored already hashed. It is a real credential the moment
 * the user types it, and a pending row is no safer a place to keep plaintext
 * than any other.
 */
const pendingRegistrationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
    },
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },
    phone: { type: String, trim: true, maxlength: 32 },

    /**
     * bcrypt digest, hashed before the document is ever written.
     *
     * **Optional**, and its absence is meaningful: a row without one came from
     * a guest checkout, where the customer asked for an account but was never
     * shown a password field - they were buying something, not filling in a
     * signup form. Those rows take the two-step path instead, verifying the
     * address first and collecting a password afterwards.
     *
     * The service treats a missing hash as "ask for a password", never as
     * "create an account with no credential".
     */
    passwordHash: { type: String },

    /**
     * When the address was proven, for the checkout path only.
     *
     * A normal signup never sets this - it becomes a real user the instant the
     * link is clicked, so there is nothing to remember. A checkout signup
     * lingers between "email confirmed" and "password chosen", and this is
     * what separates the two: the completion endpoint refuses a row where it
     * is null, so an emailed token cannot be spent directly on creating an
     * account and skipping the verification it was meant to perform.
     */
    emailVerifiedAt: { type: Date, default: null },

    // Only the SHA-256 of the token is kept. The raw token exists solely in
    // the email, so a database dump cannot be used to verify someone else's
    // address - the same reasoning as refresh tokens.
    tokenHash: { type: String, required: true, index: true },

    expiresAt: { type: Date, required: true },

    // Cheap abuse signal: a pending row being resent repeatedly is either a
    // mail delivery problem or someone using the endpoint to spam an inbox.
    resendCount: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// TTL index: Mongo deletes the row once `expiresAt` passes, so expired
// signups clean themselves up and the email address becomes claimable again
// without a scheduled job.
//
// Its sweep runs roughly every 60 seconds, so this is housekeeping, not the
// enforcement mechanism - the service compares `expiresAt` itself, which is
// what makes the short window exact.
pendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

pendingRegistrationSchema.statics.ttlMinutes = EMAIL_VERIFICATION_TTL_MINUTES;

const PendingRegistration = mongoose.model(
  "PendingRegistration",
  pendingRegistrationSchema
);

module.exports = PendingRegistration;
