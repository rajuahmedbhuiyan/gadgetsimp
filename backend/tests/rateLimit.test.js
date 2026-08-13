"use strict";

// Must be set before the app - and therefore config/env - is required.
// Every other suite runs with limiting off so tests are not throttled.
process.env.RATE_LIMIT_ENABLED = "true";

const express = require("express");
const request = require("supertest");
const createApp = require("../src/app");
const { createRateLimiter } = require("../src/middleware/rateLimiter");
const errorHandler = require("../src/middleware/errorHandler");
const { API } = require("./helpers");

describe("rate limiter factory", () => {
  /**
   * Exercises the real factory with a tiny budget rather than firing 900
   * requests at the configured global tier. Same code path, same headers,
   * same error envelope - just a limit small enough to test.
   */
  function appWithLimit(options) {
    const app = express();
    app.set("trust proxy", 0);
    app.use(express.json());
    app.get("/probe", createRateLimiter(options), (req, res) =>
      res.json({ success: true })
    );
    app.use(errorHandler);
    return app;
  }

  it("allows requests up to the limit and rejects the next one", async () => {
    const app = appWithLimit({ name: "test-basic", windowMs: 60_000, limit: 3 });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await request(app).get("/probe");
      expect(response.status).toBe(200);
    }

    const blocked = await request(app).get("/probe");
    expect(blocked.status).toBe(429);
  });

  it("returns 429 in the standard error envelope", async () => {
    const app = appWithLimit({ name: "test-envelope", windowMs: 60_000, limit: 1 });

    await request(app).get("/probe");
    const blocked = await request(app).get("/probe");

    expect(blocked.body).toMatchObject({
      success: false,
      code: "RATE_LIMIT_EXCEEDED",
    });
    expect(blocked.body.errors[0].message).toMatch(/Retry after \d+ seconds/);
  });

  it("advertises the budget with draft-8 RateLimit headers", async () => {
    const app = appWithLimit({ name: "test-headers", windowMs: 60_000, limit: 2 });

    const first = await request(app).get("/probe");

    // draft-8 emits a combined `RateLimit` header plus `RateLimit-Policy`.
    expect(first.headers).toHaveProperty("ratelimit");
    expect(first.headers).toHaveProperty("ratelimit-policy");
    expect(first.headers.ratelimit).toMatch(/r=\d+/);
  });

  it("sets Retry-After when the budget is exhausted", async () => {
    const app = appWithLimit({ name: "test-retry-after", windowMs: 60_000, limit: 1 });

    await request(app).get("/probe");
    const blocked = await request(app).get("/probe");

    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("keys separate callers into separate buckets", async () => {
    const app = appWithLimit({
      name: "test-keys",
      windowMs: 60_000,
      limit: 1,
      keyGenerator: (req) => req.headers["x-test-identity"] ?? "anonymous",
    });

    expect((await request(app).get("/probe").set("x-test-identity", "alice")).status).toBe(200);
    expect((await request(app).get("/probe").set("x-test-identity", "alice")).status).toBe(429);

    // Bob has his own budget and is unaffected by Alice exhausting hers.
    expect((await request(app).get("/probe").set("x-test-identity", "bob")).status).toBe(200);
  });

  it("does not charge successful requests when configured to count failures only", async () => {
    const app = express();
    app.set("trust proxy", 0);
    app.use(express.json());
    app.get(
      "/probe",
      createRateLimiter({
        name: "test-failures-only",
        windowMs: 60_000,
        limit: 2,
        skipSuccessfulRequests: true,
      }),
      (req, res) => {
        if (req.query.fail === "1") return res.status(401).json({ success: false });
        return res.json({ success: true });
      }
    );
    app.use(errorHandler);

    // Successes are free - this is what stops a legitimate shopper from being
    // locked out by their own repeated correct logins.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect((await request(app).get("/probe")).status).toBe(200);
    }

    expect((await request(app).get("/probe?fail=1")).status).toBe(401);
    expect((await request(app).get("/probe?fail=1")).status).toBe(401);
    expect((await request(app).get("/probe?fail=1")).status).toBe(429);
  });
});

describe("configured tiers", () => {
  const app = createApp();

  it("caps account creation at 5 per hour per IP", async () => {
    const attempts = [];

    for (let index = 0; index < 6; index += 1) {
      attempts.push(
        await request(app)
          .post(`${API}/auth/register`)
          // Names carry no digits - the schema rejects them, and a 422 would
          // still consume limiter budget and make this test pass for the
          // wrong reason.
          .send({
            fullName: "Bulk Signup",
            email: `bulk-${index}@example.com`,
            password: "Str0ngPass",
          })
      );
    }

    // 202, not 201: signup only accepts the request and emails a link - the
    // account is created later, by /auth/verify-email.
    expect(attempts.slice(0, 5).every((response) => response.status === 202)).toBe(true);
    expect(attempts[5].status).toBe(429);
    expect(attempts[5].body.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("does not meter the docs endpoint against the API budget", async () => {
    const response = await request(app).get(`${API}/docs.json`);

    expect(response.status).toBe(200);
    // Docs are mounted ahead of the global limiter, so no budget is consumed.
    expect(response.headers).not.toHaveProperty("ratelimit");
  });
});
