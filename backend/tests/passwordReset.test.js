"use strict";

const request = require("supertest");
const createApp = require("../src/app");
const User = require("../src/modules/user/user.model");
const { API, createUserAndLogin, uniqueEmail, lastMessageTo } = require("./helpers");
const { AUTH_PROVIDERS } = require("../src/shared/constants");

const app = createApp();

function resetTokenFor(email) {
  const message = lastMessageTo(email);
  if (!message) return null;

  const match = /reset-password\?token=([^\s"<]+)/.exec(message.text);
  return match ? decodeURIComponent(match[1]) : null;
}

async function startReset(email) {
  await request(app).post(`${API}/auth/forgot-password`).send({ email });
  return resetTokenFor(email);
}

describe("POST /auth/forgot-password", () => {
  it("emails a reset link", async () => {
    const { email } = await createUserAndLogin(app);

    const response = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email });

    expect(response.status).toBe(200);
    expect(lastMessageTo(email).subject).toMatch(/reset your/i);
    expect(resetTokenFor(email)).toEqual(expect.any(String));
  });

  it("stores only a hash of the token", async () => {
    const { email } = await createUserAndLogin(app);
    const token = await startReset(email);

    const stored = await User.findOne({ email }).select("+passwordResetTokenHash");

    expect(stored.passwordResetTokenHash).not.toBe(token);
    expect(stored.passwordResetTokenHash).toHaveLength(64); // sha256 hex
  });

  it("returns an error for an unknown address and sends nothing", async () => {
    const unknown = uniqueEmail("ghost");

    const response = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: unknown });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("ACCOUNT_NOT_FOUND");
    expect(lastMessageTo(unknown)).toBeNull();
  });

  it("tells a social-only account which provider to use instead", async () => {
    const email = uniqueEmail("social-reset");
    await User.create({
      fullName: "Facebook User",
      email,
      authProviders: [AUTH_PROVIDERS.FACEBOOK],
      socialAccounts: [{ provider: AUTH_PROVIDERS.FACEBOOK, providerId: "fb-reset-only" }],
      emailVerifiedAt: new Date(),
    });

    const response = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("SOCIAL_LOGIN_REQUIRED");
    expect(response.body.message).toMatch(/Facebook/i);
    expect(response.body.message).toMatch(/no password to reset/i);
    expect(lastMessageTo(email)).toBeNull();
  });

  it("invalidates any previous link when a new one is issued", async () => {
    const { email } = await createUserAndLogin(app);

    const firstToken = await startReset(email);
    const secondToken = await startReset(email);

    expect(secondToken).not.toBe(firstToken);

    const stale = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token: firstToken, newPassword: "BrandNewP4ss" });

    expect(stale.status).toBe(400);
    expect(stale.body.code).toBe("RESET_TOKEN_INVALID");
  });
});

describe("POST /auth/reset-password", () => {
  it("sets the new password and lets the user sign in with it", async () => {
    const { email } = await createUserAndLogin(app);
    const token = await startReset(email);

    const response = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token, newPassword: "BrandNewP4ss" });

    expect(response.status).toBe(200);

    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email, password: "BrandNewP4ss" });
    expect(login.status).toBe(200);
  });

  it("makes the old password stop working", async () => {
    const { email, password } = await createUserAndLogin(app);
    const token = await startReset(email);

    await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token, newPassword: "BrandNewP4ss" });

    const old = await request(app).post(`${API}/auth/login`).send({ email, password });
    expect(old.status).toBe(401);
  });

  it("revokes every existing session", async () => {
    const { email, authHeader } = await createUserAndLogin(app);
    const token = await startReset(email);

    await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token, newPassword: "BrandNewP4ss" });

    // A reset is the standard response to a compromise, so other devices must
    // be signed out - not left holding a valid token.
    const stale = await request(app).get(`${API}/auth/me`).set("Authorization", authHeader);
    expect(stale.status).toBe(401);
    expect(stale.body.code).toBe("TOKEN_REVOKED");

    const stored = await User.findOne({ email }).select("+sessions");
    expect(stored.sessions).toHaveLength(0);
  });

  it("is single use", async () => {
    const { email } = await createUserAndLogin(app);
    const token = await startReset(email);

    const first = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token, newPassword: "BrandNewP4ss" });
    expect(first.status).toBe(200);

    const replay = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token, newPassword: "AnotherP4ssw0rd" });

    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe("RESET_TOKEN_INVALID");
  });

  it("rejects an expired token and clears it", async () => {
    const { email } = await createUserAndLogin(app);
    const token = await startReset(email);

    await User.updateOne({ email }, { passwordResetExpiresAt: new Date(Date.now() - 1000) });

    const response = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token, newPassword: "BrandNewP4ss" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("RESET_TOKEN_EXPIRED");

    const stored = await User.findOne({ email }).select("+passwordResetTokenHash");
    expect(stored.passwordResetTokenHash).toBeUndefined();
  });

  it("rejects an unknown token", async () => {
    const response = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token: "z".repeat(43), newPassword: "BrandNewP4ss" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("RESET_TOKEN_INVALID");
  });

  it("enforces the password policy on the new password", async () => {
    const { email } = await createUserAndLogin(app);
    const token = await startReset(email);

    const response = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token, newPassword: "weak" });

    expect(response.status).toBe(422);
  });

  it("notifies the user that their password changed", async () => {
    const { email } = await createUserAndLogin(app);
    const token = await startReset(email);

    await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token, newPassword: "BrandNewP4ss" });

    // This is the message that lets a victim notice a takeover.
    expect(lastMessageTo(email).subject).toMatch(/password was changed/i);
  });

});
