"use strict";

const request = require("supertest");
const createApp = require("../src/app");
const User = require("../src/modules/user/user.model");
const { API, createUserAndLogin, uniqueEmail, verificationTokenFor } = require("./helpers");
const { REFRESH_COOKIE_NAME, USER_STATUS } = require("../src/shared/constants");

const app = createApp();

// Signup itself is covered end-to-end in registration.test.js. These suites
// cover sessions, which start once an account already exists.

describe("POST /auth/login", () => {
  it("signs in with correct credentials", async () => {
    const { accessToken } = await createUserAndLogin(app);
    expect(accessToken).toEqual(expect.any(String));
  });

  it("never exposes the password hash or session internals", async () => {
    const { user } = await createUserAndLogin(app);

    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("sessions");
    expect(user).not.toHaveProperty("tokenVersion");
  });

  it("delivers the refresh token as an httpOnly cookie, not in the body", async () => {
    const email = uniqueEmail("cookie");
    await createUserAndLogin(app, { email });

    const response = await request(app)
      .post(`${API}/auth/login`)
      .send({ email, password: "Passw0rd!" });

    const cookie = response.headers["set-cookie"].find((value) =>
      value.startsWith(REFRESH_COOKIE_NAME)
    );

    expect(cookie).toContain("HttpOnly");
    expect(JSON.stringify(response.body)).not.toContain("refreshToken");
  });

  it("gives the same response for an unknown email and a wrong password", async () => {
    const email = uniqueEmail("known");
    await createUserAndLogin(app, { email });

    const wrongPassword = await request(app)
      .post(`${API}/auth/login`)
      .send({ email, password: "NotThePassw0rd" });

    const unknownEmail = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: uniqueEmail("nobody"), password: "NotThePassw0rd" });

    // Identical status, message and code - the endpoint must not reveal
    // which email addresses are registered.
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    expect(unknownEmail.body.code).toBe(wrongPassword.body.code);
  });

  it("refuses a deactivated account", async () => {
    const { email, password } = await createUserAndLogin(app);
    await User.updateOne({ email }, { status: USER_STATUS.SUSPENDED });

    const response = await request(app).post(`${API}/auth/login`).send({ email, password });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ACCOUNT_DISABLED");
  });
});

describe("GET /auth/me", () => {
  it("returns the signed-in user with an integer id", async () => {
    const { authHeader, email } = await createUserAndLogin(app);

    const response = await request(app).get(`${API}/auth/me`).set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(email);
    expect(typeof response.body.data.user.id).toBe("number");
  });

  it("rejects a missing token", async () => {
    const response = await request(app).get(`${API}/auth/me`);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("TOKEN_MISSING");
  });

  it("rejects a malformed token", async () => {
    const response = await request(app)
      .get(`${API}/auth/me`)
      .set("Authorization", "Bearer not-a-real-jwt");

    expect(response.status).toBe(401);
  });

  it("rejects a token issued before the session was revoked", async () => {
    const { authHeader, email } = await createUserAndLogin(app);

    // logout-all bumps tokenVersion, which must invalidate the existing token.
    await request(app).post(`${API}/auth/logout-all`).set("Authorization", authHeader);

    const response = await request(app).get(`${API}/auth/me`).set("Authorization", authHeader);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("TOKEN_REVOKED");

    const stored = await User.findOne({ email }).select("+tokenVersion +sessions");
    expect(stored.tokenVersion).toBe(1);
    expect(stored.sessions).toHaveLength(0);
  });
});

describe("POST /auth/refresh", () => {
  /** Registers, verifies, and returns the resulting refresh cookie. */
  async function signedUpCookie() {
    const email = uniqueEmail("refresh");

    await request(app)
      .post(`${API}/auth/register`)
      .send({ firstName: "Raju", lastName: "Ahmed", email, password: "Str0ngPass" });

    const verified = await request(app)
      .post(`${API}/auth/verify-email`)
      .send({ token: verificationTokenFor(email) });

    return {
      email,
      cookie: verified.headers["set-cookie"].find((value) =>
        value.startsWith(REFRESH_COOKIE_NAME)
      ),
    };
  }

  it("rotates the session and issues a new access token", async () => {
    const { cookie } = await signedUpCookie();

    const response = await request(app).post(`${API}/auth/refresh`).set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
  });

  it("treats replay of an already-rotated token as compromise", async () => {
    const { email, cookie } = await signedUpCookie();

    // First use succeeds and rotates the token away.
    const first = await request(app).post(`${API}/auth/refresh`).set("Cookie", cookie);
    expect(first.status).toBe(200);

    // Replaying the same cookie must fail and burn every session.
    const replay = await request(app).post(`${API}/auth/refresh`).set("Cookie", cookie);

    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("REFRESH_TOKEN_REUSED");

    const stored = await User.findOne({ email }).select("+sessions");
    expect(stored.sessions).toHaveLength(0);
  });

  it("rejects a request with no refresh cookie", async () => {
    const response = await request(app).post(`${API}/auth/refresh`);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("REFRESH_TOKEN_MISSING");
  });
});

describe("POST /auth/change-password", () => {
  it("changes the password and revokes existing sessions", async () => {
    const { authHeader, email, password } = await createUserAndLogin(app);

    const response = await request(app)
      .post(`${API}/auth/change-password`)
      .set("Authorization", authHeader)
      .send({ currentPassword: password, newPassword: "BrandNewP4ss" });

    expect(response.status).toBe(200);

    // Old token no longer works.
    const afterChange = await request(app).get(`${API}/auth/me`).set("Authorization", authHeader);
    expect(afterChange.status).toBe(401);

    // New password works.
    const relogin = await request(app)
      .post(`${API}/auth/login`)
      .send({ email, password: "BrandNewP4ss" });
    expect(relogin.status).toBe(200);
  });

  it("rejects an incorrect current password", async () => {
    const { authHeader } = await createUserAndLogin(app);

    const response = await request(app)
      .post(`${API}/auth/change-password`)
      .set("Authorization", authHeader)
      .send({ currentPassword: "WrongOldP4ss", newPassword: "BrandNewP4ss" });

    expect(response.status).toBe(401);
  });
});

describe("input hardening", () => {
  it("neutralises a Mongo operator injection on login", async () => {
    await createUserAndLogin(app, { email: uniqueEmail("victim") });

    const response = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: { $gt: "" }, password: { $gt: "" } });

    // Must never authenticate as "the first user in the collection".
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body.data?.accessToken).toBeUndefined();
  });

  it("answers an unknown route with the standard error envelope", async () => {
    const response = await request(app).get(`${API}/not-a-real-route`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, code: "ROUTE_NOT_FOUND" });
  });
});
