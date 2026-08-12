"use strict";

const request = require("supertest");
const createApp = require("../src/app");
const { API, createUserAndLogin, uniqueEmail } = require("./helpers");

const app = createApp();

/**
 * `statusCode` in the body must match the HTTP status on every path, or it
 * becomes a field clients cannot trust - worse than not having it.
 */
describe("response envelope carries statusCode", () => {
  it("on a 200", async () => {
    const response = await request(app).get(`${API}/products`);

    expect(response.status).toBe(200);
    expect(response.body.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("on a 202 from signup", async () => {
    const response = await request(app).post(`${API}/auth/register`).send({
      firstName: "Raju",
      lastName: "Ahmed",
      email: uniqueEmail("envelope"),
      password: "Str0ngPass",
    });

    expect(response.status).toBe(202);
    expect(response.body.statusCode).toBe(202);
  });

  it("on a 201", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: "ROLE_ADMIN" });

    const response = await request(app)
      .post(`${API}/categories`)
      .set("Authorization", authHeader)
      .send({ name: "Envelope Test" });

    expect(response.status).toBe(201);
    expect(response.body.statusCode).toBe(201);
  });

  it("on a 401", async () => {
    const response = await request(app).get(`${API}/auth/me`);

    expect(response.status).toBe(401);
    expect(response.body.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("on a 404", async () => {
    const response = await request(app).get(`${API}/nope`);

    expect(response.body.statusCode).toBe(404);
  });

  it("on a 422", async () => {
    const response = await request(app).post(`${API}/auth/login`).send({ email: "nope" });

    expect(response.status).toBe(422);
    expect(response.body.statusCode).toBe(422);
  });

  it("on a 403", async () => {
    const { authHeader } = await createUserAndLogin(app);

    const response = await request(app).get(`${API}/users`).set("Authorization", authHeader);

    expect(response.status).toBe(403);
    expect(response.body.statusCode).toBe(403);
  });

  it("matches the HTTP status across a sweep of endpoints", async () => {
    const { authHeader } = await createUserAndLogin(app);

    const responses = await Promise.all([
      request(app).get(`${API}/health`),
      request(app).get(`${API}/products`),
      request(app).get(`${API}/categories`),
      request(app).get(`${API}/auth/me`).set("Authorization", authHeader),
      request(app).get(`${API}/users/me`).set("Authorization", authHeader),
      request(app).get(`${API}/products/does-not-exist`),
      request(app).post(`${API}/auth/refresh`),
    ]);

    for (const response of responses) {
      expect(response.body.statusCode).toBe(response.status);
    }
  });
});
