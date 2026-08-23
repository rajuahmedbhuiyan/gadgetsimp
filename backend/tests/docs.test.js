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
        "/auth/complete-registration",
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
        "/products/{id}",
        "/shop",
        "/shop/filter-options/{categorySlug}",
        "/shop/{slug}",
        "/cart",
        "/cart/count",
        "/cart/items",
        "/wishlist",
        "/wishlist/filter",
        "/wishlist/ids",
        "/wishlist/items",
        "/wishlist/toggle",
        "/orders",
        "/orders/filter",
        "/orders/{id}",
        "/admin/dashboard",
        "/admin/orders/filter",
        "/admin/orders/{id}",
        "/admin/orders/{id}/status",
        "/admin/orders/{id}/permanent",
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
    expect(spec.paths["/shop"].post.security).toEqual([]);
    expect(spec.paths["/shop/filter-options/{categorySlug}"].get.security).toEqual([]);
    expect(spec.paths["/shop/{slug}"].get.security).toEqual([]);
    expect(spec.paths["/products/filter"].post.security).toBeUndefined();
  });

  it("documents complete catalog request bodies with examples", () => {
    for (const [path, method] of [
      ["/products", "post"],
      ["/products/filter", "post"],
      ["/shop", "post"],
      ["/cart/items", "post"],
      ["/cart/items", "patch"],
      ["/cart/items", "delete"],
      ["/wishlist/filter", "post"],
      ["/wishlist/items", "post"],
      ["/wishlist/items", "delete"],
      ["/wishlist/toggle", "post"],
      ["/orders", "post"],
      ["/orders/filter", "post"],
      ["/admin/orders/filter", "post"],
      ["/admin/orders/{id}", "patch"],
      ["/admin/orders/{id}/status", "patch"],
      ["/auth/complete-registration", "post"],
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
      // Either form counts: `example` is the single sample, `examples` the
      // named set Swagger UI shows in a dropdown. The second is strictly
      // richer, so demanding the first would push docs the wrong way.
      const hasExample = Boolean(media?.example) || Object.keys(media?.examples ?? {}).length > 0;

      expect({ path, method, hasSchema: Boolean(media?.schema), hasExample }).toEqual({
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

describe("docs match the routes that actually exist", () => {
  const spec = buildSpec();

  /**
   * `POST /products/filter-options` was documented - and documented as public -
   * while having no route at all, so anyone following the docs got a 404.
   *
   * Rather than reconstruct paths from Express's router internals (whose layer
   * regexps are an implementation detail), this calls each documented endpoint
   * and asserts it is routed. Any status is acceptable except the router's own
   * ROUTE_NOT_FOUND: a 401 or 422 still proves the endpoint exists.
   */
  const placeholder = { id: "6712f0c2a1b4d3e5f6a7b8c9", slug: "some-slug" };

  const documented = Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.keys(item)
      .filter((method) => method !== "parameters")
      .map((method) => [method, path])
  );

  it.each(documented)("%s %s is routed", async (method, path) => {
    const url = API + path.replace(/\{(\w+)\}/g, (_, name) => placeholder[name] ?? "1");

    const response = await request(app)[method](url).send({});

    expect({ method, path, code: response.body?.code }).not.toMatchObject({
      code: "ROUTE_NOT_FOUND",
    });
  });
});

describe("swagger tags stay honest", () => {
  const spec = buildSpec();

  const usedTags = new Set(
    Object.values(spec.paths).flatMap((item) =>
      Object.entries(item)
        .filter(([method]) => method !== "parameters")
        .flatMap(([, operation]) => operation.tags ?? [])
    )
  );
  const declaredTags = new Set(spec.tags.map((tag) => tag.name));

  it("declares no tag without operations", () => {
    // A declared-but-unused tag renders as an empty section in Swagger UI,
    // which reads as a broken spec rather than a roadmap.
    expect([...declaredTags].filter((tag) => !usedTags.has(tag))).toEqual([]);
  });

  it("uses no tag it has not declared", () => {
    // An undeclared tag still groups operations, but with no description and
    // in arbitrary order.
    expect([...usedTags].filter((tag) => !declaredTags.has(tag))).toEqual([]);
  });
});

describe("documented request bodies match the validators", () => {
  const spec = buildSpec();

  /**
   * `showInHome` was accepted by `POST /categories` for a while without ever
   * appearing in the docs - the third time a field was live but invisible.
   * Hand-written YAML always drifts from the schema it describes; the only
   * cure is something that compares the two.
   *
   * Zod is the source of truth: whatever the validator accepts is the
   * contract, so every one of its keys must be documented.
   */
  const cases = [
    ["/categories", "post", require("../src/modules/category/category.validation").createCategory],
    ["/categories/{id}", "put", require("../src/modules/category/category.validation").updateCategory],
    ["/brands", "post", require("../src/modules/brand/brand.validation").createBrand],
    ["/attributes", "post", require("../src/modules/attribute/attribute.validation").createAttribute],
    ["/products", "post", require("../src/modules/product/product.validation").createProduct],
    ["/shop", "post", require("../src/modules/shop/shop.validation").shopFilter],
    ["/shop/categories", "post", require("../src/modules/shop/shop.validation").shopCategories],
    ["/cart/items", "post", require("../src/modules/cart/cart.validation").addItems],
    ["/cart/items", "patch", require("../src/modules/cart/cart.validation").updateItems],
    ["/cart/items", "delete", require("../src/modules/cart/cart.validation").removeItems],
    ["/wishlist/filter", "post", require("../src/modules/wishlist/wishlist.validation").filterItems],
    ["/wishlist/items", "post", require("../src/modules/wishlist/wishlist.validation").addItems],
    ["/wishlist/items", "delete", require("../src/modules/wishlist/wishlist.validation").removeItems],
    ["/wishlist/toggle", "post", require("../src/modules/wishlist/wishlist.validation").toggleItem],
    ["/orders", "post", require("../src/modules/order/order.validation").placeOrder],
    ["/orders/filter", "post", require("../src/modules/order/order.validation").myOrders],
    ["/admin/orders/filter", "post", require("../src/modules/order/order.validation").filterOrders],
    ["/admin/orders/{id}", "patch", require("../src/modules/order/order.validation").updateOrderDetails],
    ["/admin/orders/{id}/status", "patch", require("../src/modules/order/order.validation").changeStatus],
    ["/auth/complete-registration", "post", require("../src/modules/auth/auth.validation").completeRegistration],
  ];

  /** Zod v4 exposes the object's shape; unwrap any refine/default wrappers. */
  function zodKeys(schema) {
    let cursor = schema;
    for (let depth = 0; depth < 10 && cursor; depth += 1) {
      if (cursor.shape) return Object.keys(cursor.shape);
      cursor = cursor._def?.innerType ?? cursor._def?.schema ?? cursor.def?.innerType ?? cursor.def?.schema;
    }
    return null;
  }

  /** Follow a $ref and flatten allOf, so composition does not hide fields. */
  function documentedKeys(schema) {
    if (!schema) return [];
    if (schema.$ref) return documentedKeys(spec.components.schemas[schema.$ref.split("/").pop()]);
    if (schema.allOf) return schema.allOf.flatMap(documentedKeys);
    return Object.keys(schema.properties ?? {});
  }

  it.each(cases)("%s %s documents every field it accepts", (path, method, validation) => {
    const accepted = zodKeys(validation.body);
    expect(accepted).not.toBeNull(); // the unwrapper must keep working

    const documented = new Set(
      documentedKeys(spec.paths[path][method].requestBody?.content?.["application/json"]?.schema)
    );

    expect({ path, undocumented: accepted.filter((key) => !documented.has(key)) }).toEqual({
      path,
      undocumented: [],
    });
  });
});
