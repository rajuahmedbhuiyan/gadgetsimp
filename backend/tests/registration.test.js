"use strict";

const request = require("supertest");
const createApp = require("../src/app");
const User = require("../src/modules/user/user.model");
const PendingRegistration = require("../src/modules/auth/pendingRegistration.model");
const { API, uniqueEmail, verificationTokenFor, lastMessageTo } = require("./helpers");
const { ROLES } = require("../src/shared/constants");

const app = createApp();

const signup = (overrides = {}) => ({
  fullName: "Raju Ahmed",
  email: uniqueEmail("signup"),
  password: "Str0ngPass",
  ...overrides,
});

describe("POST /auth/register - step 1", () => {
  it("creates no account, only a pending record", async () => {
    const body = signup();

    const response = await request(app).post(`${API}/auth/register`).send(body);

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);

    // The whole point of the flow: nothing in `users` yet.
    expect(await User.exists({ email: body.email })).toBeNull();
    expect(await PendingRegistration.exists({ email: body.email })).not.toBeNull();
  });

  it("returns no user and no tokens", async () => {
    const response = await request(app).post(`${API}/auth/register`).send(signup());

    expect(response.body.data.user).toBeUndefined();
    expect(response.body.data.accessToken).toBeUndefined();
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("emails a verification link", async () => {
    const body = signup();

    await request(app).post(`${API}/auth/register`).send(body);

    const message = lastMessageTo(body.email);
    expect(message).not.toBeNull();
    expect(message.subject).toMatch(/confirm/i);
    expect(verificationTokenFor(body.email)).toEqual(expect.any(String));
  });

  it("stores the password hashed, never in plain text", async () => {
    const body = signup();

    await request(app).post(`${API}/auth/register`).send(body);

    const pending = await PendingRegistration.findOne({ email: body.email });
    expect(pending.passwordHash).not.toBe(body.password);
    expect(pending.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("stores only a hash of the token, not the token itself", async () => {
    const body = signup();

    await request(app).post(`${API}/auth/register`).send(body);

    const token = verificationTokenFor(body.email);
    const pending = await PendingRegistration.findOne({ email: body.email });

    expect(pending.tokenHash).not.toBe(token);
    expect(pending.tokenHash).toHaveLength(64); // sha256 hex
  });

  it("does not reveal that an email is already registered", async () => {
    const body = signup();

    // First signup, verified through to a real account.
    await request(app).post(`${API}/auth/register`).send(body);
    const token = verificationTokenFor(body.email);
    await request(app).post(`${API}/auth/verify-email`).send({ token });

    const second = await request(app).post(`${API}/auth/register`).send(signup({ email: body.email }));
    const fresh = await request(app).post(`${API}/auth/register`).send(signup());

    // Identical status and message - no enumeration oracle.
    expect(second.status).toBe(fresh.status);
    expect(second.body.message).toBe(fresh.body.message);
  });

  it("warns the real account holder, using their own name", async () => {
    const body = signup({ fullName: "Genuine Owner" });

    await request(app).post(`${API}/auth/register`).send(body);
    await request(app)
      .post(`${API}/auth/verify-email`)
      .send({ token: verificationTokenFor(body.email) });

    // Someone else attempts to sign up with the same address.
    await request(app)
      .post(`${API}/auth/register`)
      .send(signup({ email: body.email, fullName: "Impostor Person" }));

    const notice = lastMessageTo(body.email);
    expect(notice.subject).toMatch(/tried to sign up/i);
    // Addressed to the account holder, not the name the stranger submitted.
    expect(notice.text).toContain("Genuine");
    expect(notice.text).not.toContain("Impostor");
  });

  it("replaces the pending record when signing up twice", async () => {
    const body = signup();

    await request(app).post(`${API}/auth/register`).send(body);
    const firstToken = verificationTokenFor(body.email);

    await request(app).post(`${API}/auth/register`).send(body);
    const secondToken = verificationTokenFor(body.email);

    expect(secondToken).not.toBe(firstToken);
    expect(await PendingRegistration.countDocuments({ email: body.email })).toBe(1);
  });

  it("rejects an attempt to self-assign a role", async () => {
    const response = await request(app)
      .post(`${API}/auth/register`)
      .send({ ...signup(), role: ROLES.ADMIN });

    expect(response.status).toBe(422);
  });

  it("requires a name", async () => {
    const response = await request(app)
      .post(`${API}/auth/register`)
      .send({ email: uniqueEmail(), password: "Str0ngPass" });

    expect(response.status).toBe(422);
    expect(response.body.errors.some((issue) => issue.field === "body.fullName")).toBe(true);
  });

  // A mononym is a name. Requiring a surname would force either a lie or a
  // placeholder on a large share of real customers.
  it("accepts a single-word name", async () => {
    const response = await request(app)
      .post(`${API}/auth/register`)
      .send(signup({ fullName: "Rahim" }));

    expect(response.status).toBe(202);
  });
});

describe("POST /auth/verify-email - step 2", () => {
  async function startSignup(overrides = {}) {
    const body = signup(overrides);
    await request(app).post(`${API}/auth/register`).send(body);
    return { body, token: verificationTokenFor(body.email) };
  }

  it("creates the account and signs the user in", async () => {
    const { body, token } = await startSignup();

    const response = await request(app).post(`${API}/auth/verify-email`).send({ token });

    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe(body.email);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(await User.exists({ email: body.email })).not.toBeNull();
  });

  it("assigns an integer id and the customer role", async () => {
    const { token } = await startSignup();

    const response = await request(app).post(`${API}/auth/verify-email`).send({ token });
    const { user } = response.body.data;

    expect(typeof user.id).toBe("number");
    expect(Number.isInteger(user.id)).toBe(true);
    expect(user.role).toBe(ROLES.CUSTOMER);
  });

  it("exposes fullName as a single stored field, and no addresses", async () => {
    const { token } = await startSignup({ fullName: "Raju Ahmed" });

    const { body } = await request(app).post(`${API}/auth/verify-email`).send({ token });

    expect(body.data.user).toMatchObject({ fullName: "Raju Ahmed" });
    expect(body.data.user).not.toHaveProperty("firstName");
    expect(body.data.user).not.toHaveProperty("lastName");
    expect(body.data.user).not.toHaveProperty("addresses");
  });

  it("marks the account as verified", async () => {
    const { token } = await startSignup();

    const response = await request(app).post(`${API}/auth/verify-email`).send({ token });

    expect(response.body.data.user.emailVerifiedAt).toEqual(expect.any(String));
  });

  it("keeps the password usable for login afterwards", async () => {
    const { body, token } = await startSignup();

    await request(app).post(`${API}/auth/verify-email`).send({ token });

    // Guards the double-hash trap: the pending record holds a bcrypt digest,
    // and re-hashing it on save would lock the user out of their own account.
    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: body.email, password: body.password });

    expect(login.status).toBe(200);
  });

  it("consumes the token so the link cannot be replayed", async () => {
    const { token } = await startSignup();

    const first = await request(app).post(`${API}/auth/verify-email`).send({ token });
    expect(first.status).toBe(201);

    const replay = await request(app).post(`${API}/auth/verify-email`).send({ token });
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe("VERIFICATION_TOKEN_INVALID");
  });

  it("removes the pending record on success", async () => {
    const { body, token } = await startSignup();

    await request(app).post(`${API}/auth/verify-email`).send({ token });

    expect(await PendingRegistration.exists({ email: body.email })).toBeNull();
  });

  it("rejects an unknown token", async () => {
    const response = await request(app)
      .post(`${API}/auth/verify-email`)
      .send({ token: "b".repeat(43) });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VERIFICATION_TOKEN_INVALID");
  });

  it("rejects an expired token and clears the pending record", async () => {
    const { body, token } = await startSignup();

    await PendingRegistration.updateOne(
      { email: body.email },
      { expiresAt: new Date(Date.now() - 1000) }
    );

    const response = await request(app).post(`${API}/auth/verify-email`).send({ token });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VERIFICATION_TOKEN_EXPIRED");
    expect(await PendingRegistration.exists({ email: body.email })).toBeNull();
  });
});

describe("POST /auth/resend-verification", () => {
  it("issues a new token and invalidates the previous one", async () => {
    const body = signup();
    await request(app).post(`${API}/auth/register`).send(body);
    const originalToken = verificationTokenFor(body.email);

    // Bypass the 60s cooldown, which is about abuse rather than correctness.
    await PendingRegistration.updateOne(
      { email: body.email },
      { lastSentAt: new Date(Date.now() - 120_000) }
    );

    const resend = await request(app)
      .post(`${API}/auth/resend-verification`)
      .send({ email: body.email });
    expect(resend.status).toBe(200);

    const newToken = verificationTokenFor(body.email);
    expect(newToken).not.toBe(originalToken);

    // The superseded link must no longer work.
    const stale = await request(app)
      .post(`${API}/auth/verify-email`)
      .send({ token: originalToken });
    expect(stale.status).toBe(400);

    const fresh = await request(app).post(`${API}/auth/verify-email`).send({ token: newToken });
    expect(fresh.status).toBe(201);
  });

  it("enforces a cooldown between resends", async () => {
    const body = signup();
    await request(app).post(`${API}/auth/register`).send(body);

    const response = await request(app)
      .post(`${API}/auth/resend-verification`)
      .send({ email: body.email });

    expect(response.status).toBe(429);
    expect(response.body.code).toBe("RESEND_COOLDOWN");
  });

  it("answers 200 for an address with no pending signup", async () => {
    const response = await request(app)
      .post(`${API}/auth/resend-verification`)
      .send({ email: uniqueEmail("nobody") });

    expect(response.status).toBe(200);
  });
});

describe("mail delivery failures", () => {
  const mailer = require("../src/config/mailer");

  /**
   * A provider rejection is an upstream failure, not a bug in the request.
   * Before this was handled it surfaced as a bare 500 "Something went wrong",
   * which tells the client nothing it can act on.
   */
  function stubSmtpFailure(overrides) {
    return jest
      .spyOn(require("nodemailer"), "createTransport")
      .mockReturnValue({
        sendMail: jest.fn().mockRejectedValue(Object.assign(new Error("Data command failed"), overrides)),
        close: jest.fn(),
      });
  }

  afterEach(() => {
    jest.restoreAllMocks();
    mailer.closeMailer();
  });

  it("reports Gmail's daily cap as 503 EMAIL_QUOTA_EXCEEDED", async () => {
    mailer.closeMailer(); // drop the cached transport so the stub is used
    stubSmtpFailure({
      responseCode: 550,
      response: "550-5.4.5 Daily user sending limit exceeded",
      code: "EENVELOPE",
    });

    const response = await request(app).post(`${API}/auth/register`).send(signup());

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("EMAIL_QUOTA_EXCEEDED");
    // Never leaks the raw SMTP transcript to the client.
    expect(response.body.message).not.toMatch(/5\.4\.5|gsmtp/);
  });

  it("reports any other send failure as 503 EMAIL_DELIVERY_FAILED", async () => {
    mailer.closeMailer();
    stubSmtpFailure({ code: "EAUTH", response: "535 Bad credentials" });

    const response = await request(app).post(`${API}/auth/register`).send(signup());

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("EMAIL_DELIVERY_FAILED");
  });
});
