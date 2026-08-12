"use strict";

const request = require("supertest");
const createApp = require("../src/app");
const { API, createUserAndLogin, uniqueEmail } = require("./helpers");
const { ROLES } = require("../src/shared/constants");

const app = createApp();

/**
 * `statusCode` in the body must equal the HTTP status on every path. A field
 * that is right most of the time is worse than not having it, because clients
 * start trusting it.
 */
describe("response envelope carries statusCode", () => {
  it("on a 200", async () => {
    const response = await request(app).get(`${API}/health`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, statusCode: 200 });
  });

  it("on the 202 from signup", async () => {
    const response = await request(app).post(`${API}/auth/register`).send({
      firstName: "Raju",
      lastName: "Ahmed",
      email: uniqueEmail("envelope"),
      password: "Str0ngPass",
    });

    expect(response.status).toBe(202);
    expect(response.body.statusCode).toBe(202);
  });


  it("on a 401", async () => {
    const response = await request(app).get(`${API}/auth/me`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false, statusCode: 401 });
  });

  it("on a 403", async () => {
    const { authHeader } = await createUserAndLogin(app);

    const response = await request(app)
      .post(`${API}/users/filter`)
      .set("Authorization", authHeader)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.statusCode).toBe(403);
  });

  it("on a 404", async () => {
    const response = await request(app).get(`${API}/not-a-real-route`);

    expect(response.body.statusCode).toBe(404);
  });

  it("on a 422", async () => {
    const response = await request(app).post(`${API}/auth/login`).send({ email: "nope" });

    expect(response.status).toBe(422);
    expect(response.body.statusCode).toBe(422);
  });

  it("matches the HTTP status across a sweep of endpoints", async () => {
    const { authHeader } = await createUserAndLogin(app);

    const responses = await Promise.all([
      request(app).get(`${API}/health`),
      request(app).get(`${API}/auth/providers`),
      request(app).get(`${API}/auth/me`).set("Authorization", authHeader),
      request(app).get(`${API}/users/me`).set("Authorization", authHeader),
      request(app).post(`${API}/auth/refresh`),
      request(app).patch(`${API}/users/me`).set("Authorization", authHeader).send({}),
    ]);

    for (const response of responses) {
      expect(response.body.statusCode).toBe(response.status);
    }
  });
});

describe("verification link validity window", () => {
  it("tells the user the window in the email", async () => {
    const {
      verificationEmail,
    } = require("../src/modules/auth/auth.emails");
    const { EMAIL_VERIFICATION_TTL_MINUTES } = require("../src/shared/constants");

    expect(EMAIL_VERIFICATION_TTL_MINUTES).toBe(10);

    const email = verificationEmail({ firstName: "Raju", token: "abc" });

    // Rendered as minutes, not a rounded "0 hours".
    expect(email.text).toContain("10 minutes");
    expect(email.html).toContain("10 minutes");
  });
});
