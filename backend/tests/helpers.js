"use strict";

const request = require("supertest");
const User = require("../src/modules/user/user.model");
const { getSentMessages, clearSentMessages } = require("../src/config/mailer");
const { ROLES } = require("../src/shared/constants");

const API = process.env.API_PREFIX ?? "/api/v1";

let sequence = 0;

function uniqueEmail(prefix = "user") {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}@test.dev`;
}

/**
 * Creates a verified user directly and signs them in through the real login
 * route, so tests exercise the actual token-issuing path rather than minting
 * JWTs by hand and drifting from it.
 *
 * Deliberately bypasses the email-verification flow: most tests are about
 * something else, and making each one round-trip a mailbox would make the
 * suite slow and noisy. `tests/registration.test.js` covers that flow
 * end-to-end instead.
 */
async function createUserAndLogin(
  app,
  { role = ROLES.CUSTOMER, email, password = "Passw0rd!", firstName = "Test", lastName = "User" } = {}
) {
  const address = email ?? uniqueEmail(role.toLowerCase());

  await User.create({
    firstName,
    lastName,
    email: address,
    password,
    role,
    emailVerifiedAt: new Date(),
  });

  const response = await request(app)
    .post(`${API}/auth/login`)
    .send({ email: address, password });

  if (response.status !== 200) {
    throw new Error(`Login failed in test helper: ${response.status} ${response.text}`);
  }

  return {
    email: address,
    password,
    accessToken: response.body.data.accessToken,
    user: response.body.data.user,
    id: response.body.data.user.id,
    authHeader: `Bearer ${response.body.data.accessToken}`,
  };
}

/**
 * Pulls the verification token out of the most recent email sent to `email`.
 * The log transport keeps message bodies in memory precisely so tests can do
 * this without an SMTP server.
 */
function verificationTokenFor(email) {
  const message = [...getSentMessages()].reverse().find((sent) => sent.to === email);

  if (!message) return null;

  const match = /verify-email\?token=([^\s"<]+)/.exec(message.text);

  return match ? decodeURIComponent(match[1]) : null;
}

function lastMessageTo(email) {
  return [...getSentMessages()].reverse().find((sent) => sent.to === email) ?? null;
}

module.exports = {
  API,
  createUserAndLogin,
  uniqueEmail,
  verificationTokenFor,
  lastMessageTo,
  getSentMessages,
  clearSentMessages,
};
