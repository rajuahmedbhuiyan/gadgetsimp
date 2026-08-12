"use strict";

const request = require("supertest");
const createApp = require("../src/app");
const { buildSpec } = require("../src/config/swagger");
const { API } = require("./helpers");

const app = createApp();

describe("OpenAPI spec", () => {
  const spec = buildSpec();

  it("documents every mounted module", async () => {
    const paths = Object.keys(spec.paths);

    expect(paths).toEqual(
      expect.arrayContaining([
        "/health",
        "/auth/register",
        "/auth/verify-email",
        "/auth/resend-verification",
        "/auth/social-login",
        "/auth/providers",
        "/auth/login",
        "/auth/refresh",
        "/users/me",
        "/users/create",
        "/users/filter",
        "/users/{id}",
        "/users/{id}/permanent",
        "/users/{id}/role",
        "/media/upload",
        "/media/my",
        "/media/filter",
        "/media/{id}",
        "/products",
        "/products/filter",
        "/products/filter-options",
        "/products/{id}",
        "/variations/generate",
        "/variations/filter",
        "/variations/{id}",
        "/categories",
        "/categories/filter",
        "/categories/filter-groupped",
        "/categories/sort",
        "/categories/{id}/configuration",
        "/brands",
        "/brands/filter",
        "/attributes",
        "/attributes/filter",
      ])
    );
  });

  it("resolves every $ref it declares", () => {
    // A typo in a $ref renders as a broken node in Swagger UI rather than an
    // error, so it is worth asserting on.
    const refs = new Set();

    JSON.stringify(spec, (key, value) => {
      if (key === "$ref" && typeof value === "string") refs.add(value);
      return value;
    });

    expect(refs.size).toBeGreaterThan(0);

    for (const ref of refs) {
      const segments = ref.replace(/^#\//, "").split("/");
      const resolved = segments.reduce((node, segment) => node?.[segment], spec);
      expect({ ref, found: resolved !== undefined }).toEqual({ ref, found: true });
    }
  });

  it("declares bearer auth and applies it by default", () => {
    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(spec.security).toEqual([{ bearerAuth: [] }]);
  });

  it("marks public endpoints as not requiring auth", () => {
    // `security: []` is the opt-out. Login must have it, or Swagger UI shows
    // a padlock and developers assume they need a token to sign in.
    expect(spec.paths["/auth/login"].post.security).toEqual([]);
    // The whole signup flow runs before a token exists.
    expect(spec.paths["/auth/register"].post.security).toEqual([]);
    expect(spec.paths["/auth/verify-email"].post.security).toEqual([]);
    expect(spec.paths["/auth/resend-verification"].post.security).toEqual([]);
    expect(spec.paths["/auth/social-login"].post.security).toEqual([]);
    expect(spec.paths["/products/filter"].post.security).toEqual([]);
    expect(spec.paths["/products/filter-options"].post.security).toEqual([]);
  });

  it("documents complete catalog request bodies with examples", () => {
    for (const [path, method] of [
      ["/products", "post"],
      ["/products/filter", "post"],
      ["/products/filter-options", "post"],
      ["/products/{id}", "put"],
      ["/variations/generate", "post"],
      ["/variations/filter", "post"],
      ["/variations/{id}", "patch"],
      ["/categories", "post"],
      ["/categories/filter", "post"],
      ["/categories/filter-groupped", "post"],
      ["/categories/sort", "put"],
      ["/categories/{id}", "put"],
      ["/brands", "post"],
      ["/brands/filter", "post"],
      ["/brands/{id}", "put"],
      ["/attributes", "post"],
      ["/attributes/filter", "post"],
      ["/attributes/{id}", "put"],
    ]) {
      const media = spec.paths[path][method].requestBody?.content?.["application/json"];
      expect({ path, method, hasSchema: Boolean(media?.schema), hasExample: Boolean(media?.example) }).toEqual({
        path,
        method,
        hasSchema: true,
        hasExample: true,
      });
    }
  });

  it("uses direct catalog resource paths and PUT updates", () => {
    expect(spec.paths["/products/create"]).toBeUndefined();
    expect(spec.paths["/categories/create"]).toBeUndefined();
    expect(spec.paths["/brands/create"]).toBeUndefined();
    expect(spec.paths["/attributes/create"]).toBeUndefined();
    expect(spec.paths["/products/{id}"].patch).toBeUndefined();
    expect(spec.paths["/products/{id}"].put).toBeDefined();
    expect(spec.paths["/variations/{id}"].delete).toBeDefined();
  });

  it("documents both social providers on the one endpoint", () => {
    const type =
      spec.paths["/auth/social-login"].post.requestBody.content["application/json"]
        .schema.properties.type;

    expect(type.enum).toEqual(["FACEBOOK", "GOOGLE"]);
  });

  it("documents the four roles", () => {
    expect(spec.components.schemas.Role.enum).toEqual([
      "ROLE_CUSTOMER",
      "ROLE_MODERATOR",
      "ROLE_ADMIN",
      "ROLE_OWNER",
    ]);
  });
});

describe("docs endpoints", () => {
  it("serves the raw spec as JSON", async () => {
    const response = await request(app).get(`${API}/docs.json`);

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe("3.0.3");
    expect(response.body.info.title).toBe("GadgetSimp Commerce API");
  });

  it("serves the Swagger UI page", async () => {
    const response = await request(app).get(`${API}/docs/`);

    expect(response.status).toBe(200);
    expect(response.text).toContain("swagger-ui");
  });
});

describe("health", () => {
  it("reports database connectivity", async () => {
    const response = await request(app).get(`${API}/health`);

    expect(response.status).toBe(200);
    expect(response.body.data.database).toBe("connected");
  });
});
