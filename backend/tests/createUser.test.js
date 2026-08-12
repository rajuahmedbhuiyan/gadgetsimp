"use strict";

const request = require("supertest");
const createApp = require("../src/app");
const User = require("../src/modules/user/user.model");
const { API, createUserAndLogin, uniqueEmail, lastMessageTo } = require("./helpers");
const { ROLES, AUTH_PROVIDERS } = require("../src/shared/constants");
const { generatePassword } = require("../src/shared/generatePassword");

const app = createApp();

const newUser = (overrides = {}) => ({
  firstName: "Nadia",
  lastName: "Khan",
  email: uniqueEmail("created"),
  ...overrides,
});

describe("POST /users - owner only", () => {
  it.each([
    [ROLES.OWNER, 201],
    [ROLES.ADMIN, 403],
    [ROLES.MODERATOR, 403],
    [ROLES.CUSTOMER, 403],
  ])("%s -> %i", async (role, expected) => {
    const { authHeader } = await createUserAndLogin(app, { role });

    const response = await request(app)
      .post(`${API}/users/create`)
      .set("Authorization", authHeader)
      .send(newUser());

    expect(response.status).toBe(expected);
  });

  it("requires authentication", async () => {
    const response = await request(app).post(`${API}/users/create`).send(newUser());

    expect(response.status).toBe(401);
  });
});

describe("POST /users - account shape", () => {
  async function asOwner() {
    return createUserAndLogin(app, { role: ROLES.OWNER });
  }

  it("creates an already-verified account that can sign in immediately", async () => {
    const { authHeader } = await asOwner();
    const body = newUser({ password: "Str0ngPass" });

    const response = await request(app)
      .post(`${API}/users/create`)
      .set("Authorization", authHeader)
      .send(body);

    expect(response.status).toBe(201);
    expect(response.body.data.user.emailVerifiedAt).toEqual(expect.any(String));

    // No verification round trip: the account is usable at once.
    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: body.email, password: "Str0ngPass" });
    expect(login.status).toBe(200);
  });

  it("defaults to ROLE_CUSTOMER and the EMAIL provider", async () => {
    const { authHeader } = await asOwner();

    const response = await request(app)
      .post(`${API}/users/create`)
      .set("Authorization", authHeader)
      .send(newUser({ password: "Str0ngPass" }));

    expect(response.body.data.user.role).toBe(ROLES.CUSTOMER);
    expect(response.body.data.user.authProviders).toEqual([AUTH_PROVIDERS.EMAIL]);
  });

  it("lets an owner create staff", async () => {
    const { authHeader } = await asOwner();

    const response = await request(app)
      .post(`${API}/users/create`)
      .set("Authorization", authHeader)
      .send(newUser({ password: "Str0ngPass", role: ROLES.ADMIN }));

    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe(ROLES.ADMIN);
  });

  it("refuses to create another owner", async () => {
    const { authHeader } = await asOwner();

    // Same rule as promotion: nobody creates a peer or a superior, or this
    // endpoint becomes a way around /users/:id/role.
    const response = await request(app)
      .post(`${API}/users/create`)
      .set("Authorization", authHeader)
      .send(newUser({ password: "Str0ngPass", role: ROLES.OWNER }));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ROLE_ABOVE_ACTOR");
  });

  it("rejects a duplicate email", async () => {
    const { authHeader } = await asOwner();
    const body = newUser({ password: "Str0ngPass" });

    await request(app).post(`${API}/users/create`).set("Authorization", authHeader).send(body);
    const second = await request(app)
      .post(`${API}/users/create`)
      .set("Authorization", authHeader)
      .send(body);

    expect(second.status).toBe(409);
  });

  it("never returns the password hash", async () => {
    const { authHeader } = await asOwner();

    const response = await request(app)
      .post(`${API}/users/create`)
      .set("Authorization", authHeader)
      .send(newUser({ password: "Str0ngPass" }));

    expect(response.body.data.user).not.toHaveProperty("password");
  });
});

describe("POST /users - password generation", () => {
  async function asOwner() {
    return createUserAndLogin(app, { role: ROLES.OWNER });
  }

  it("generates a working password when none is supplied", async () => {
    const { authHeader } = await asOwner();
    const body = newUser();

    const response = await request(app)
      .post(`${API}/users/create`)
      .set("Authorization", authHeader)
      .send(body);

    expect(response.status).toBe(201);
    const generated = response.body.data.generatedPassword;
    expect(generated).toEqual(expect.any(String));

    // Returned once so the owner can relay it - and it must actually work.
    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: body.email, password: generated });
    expect(login.status).toBe(200);
  });

  it("does not echo back a password the caller supplied", async () => {
    const { authHeader } = await asOwner();

    const response = await request(app)
      .post(`${API}/users/create`)
      .set("Authorization", authHeader)
      .send(newUser({ password: "Str0ngPass" }));

    // Echoing it would put a known secret in the caller's logs for nothing.
    expect(response.body.data.generatedPassword).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain("Str0ngPass");
  });

  it("emails the temporary password to the new user", async () => {
    const { authHeader } = await asOwner();
    const body = newUser();

    const response = await request(app)
      .post(`${API}/users/create`)
      .set("Authorization", authHeader)
      .send(body);

    const message = lastMessageTo(body.email);
    expect(message.subject).toMatch(/account has been created/i);
    expect(message.text).toContain(response.body.data.generatedPassword);
    expect(message.text).toMatch(/change this password/i);
  });

  it("can create an account silently with sendEmail=false", async () => {
    const { authHeader } = await asOwner();
    const body = newUser({ password: "Str0ngPass", sendEmail: false });

    await request(app).post(`${API}/users/create`).set("Authorization", authHeader).send(body);

    expect(lastMessageTo(body.email)).toBeNull();
  });
});

describe("generatePassword", () => {
  it("always satisfies the password policy", () => {
    // Drawing at random usually satisfies the policy but not always, and a
    // generator that occasionally emits a rejected password is a rare,
    // confusing bug. 500 draws makes an omission overwhelmingly likely to show.
    for (let i = 0; i < 500; i += 1) {
      const password = generatePassword();

      expect(password).toHaveLength(16);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/\d/);
    }
  });

  it("excludes visually ambiguous characters", () => {
    // Generated passwords get read off a screen and retyped.
    for (let i = 0; i < 200; i += 1) {
      expect(generatePassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generatePassword()));

    expect(seen.size).toBe(200);
  });

  it("puts the required character classes in varying positions", () => {
    // Guards the shuffle: without it the guaranteed lower/upper/digit/symbol
    // would always sit in the first four slots.
    const firstChars = new Set(
      Array.from({ length: 100 }, () => generatePassword()[0])
    );

    expect(firstChars.size).toBeGreaterThan(4);
  });
});
