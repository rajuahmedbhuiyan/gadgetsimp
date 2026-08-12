"use strict";

const request = require("supertest");
const createApp = require("../src/app");
const { API, createUserAndLogin } = require("./helpers");
const { ROLES, PRODUCT_STATUS } = require("../src/shared/constants");

const app = createApp();

async function seedTree(adminAuth) {
  const electronics = await request(app)
    .post(`${API}/categories`)
    .set("Authorization", adminAuth)
    .send({ name: "Electronics" });

  const laptops = await request(app)
    .post(`${API}/categories`)
    .set("Authorization", adminAuth)
    .send({ name: "Laptops", parent: electronics.body.data.category.id });

  const gaming = await request(app)
    .post(`${API}/categories`)
    .set("Authorization", adminAuth)
    .send({ name: "Gaming", parent: laptops.body.data.category.id });

  return {
    electronics: electronics.body.data.category,
    laptops: laptops.body.data.category,
    gaming: gaming.body.data.category,
  };
}

describe("categories", () => {
  it("builds materialised paths down the tree", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const { electronics, laptops, gaming } = await seedTree(authHeader);

    expect(electronics.path).toBe("/electronics");
    expect(electronics.depth).toBe(0);
    expect(laptops.path).toBe("/electronics/laptops");
    expect(laptops.depth).toBe(1);
    expect(gaming.path).toBe("/electronics/laptops/gaming");
    expect(gaming.depth).toBe(2);
  });

  it("returns a nested tree when asked", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    await seedTree(authHeader);

    const response = await request(app).get(`${API}/categories?tree=true`);

    expect(response.status).toBe(200);
    const [root] = response.body.data.categories;
    expect(root.slug).toBe("electronics");
    expect(root.children[0].slug).toBe("laptops");
    expect(root.children[0].children[0].slug).toBe("gaming");
  });

  it("rewrites descendant paths when a category is renamed", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const { electronics, gaming } = await seedTree(authHeader);

    await request(app)
      .patch(`${API}/categories/${electronics.id}`)
      .set("Authorization", authHeader)
      .send({ name: "Consumer Tech" });

    const response = await request(app).get(`${API}/categories?tree=true`);
    const [root] = response.body.data.categories;

    expect(root.slug).toBe("consumer-tech");

    // The grandchild's stored path must have been rewritten too, otherwise
    // subtree product queries would silently return nothing.
    const flat = await request(app).get(`${API}/categories?limit=100`);
    const renamedGrandchild = flat.body.data.categories.find(
      (category) => String(category._id ?? category.id) === gaming.id
    );
    expect(renamedGrandchild.path).toBe("/consumer-tech/laptops/gaming");
  });

  it("refuses to move a category beneath its own descendant", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const { electronics, gaming } = await seedTree(authHeader);

    const response = await request(app)
      .patch(`${API}/categories/${electronics.id}`)
      .set("Authorization", authHeader)
      .send({ parent: gaming.id });

    expect(response.status).toBe(400);
  });

  it("refuses to delete a category that still has children", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const { laptops } = await seedTree(authHeader);

    const response = await request(app)
      .delete(`${API}/categories/${laptops.id}`)
      .set("Authorization", authHeader);

    expect(response.status).toBe(409);
  });

  it("blocks a customer from creating a category", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .post(`${API}/categories`)
      .set("Authorization", authHeader)
      .send({ name: "Should Not Exist" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("INSUFFICIENT_ROLE");
  });
});

describe("products", () => {
  async function seedProducts(adminAuth) {
    const { laptops, gaming } = await seedTree(adminAuth);

    const active = await request(app)
      .post(`${API}/products`)
      .set("Authorization", adminAuth)
      .send({
        title: "MacBook Air M3",
        brand: "Apple",
        category: laptops.id,
        price: 16999900,
        stock: 10,
        status: PRODUCT_STATUS.ACTIVE,
        tags: ["ultrabook"],
      });

    const nested = await request(app)
      .post(`${API}/products`)
      .set("Authorization", adminAuth)
      .send({
        title: "ROG Strix G16",
        brand: "ASUS",
        category: gaming.id,
        price: 21499900,
        stock: 3,
        status: PRODUCT_STATUS.ACTIVE,
      });

    const draft = await request(app)
      .post(`${API}/products`)
      .set("Authorization", adminAuth)
      .send({
        title: "Unreleased Pixel Fold",
        category: laptops.id,
        price: 21999900,
        stock: 0,
        status: PRODUCT_STATUS.DRAFT,
      });

    return {
      active: active.body.data.product,
      nested: nested.body.data.product,
      draft: draft.body.data.product,
      laptops,
      gaming,
    };
  }

  it("hides draft products from anonymous callers", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    await seedProducts(authHeader);

    const response = await request(app).get(`${API}/products`);
    const titles = response.body.data.products.map((product) => product.title);

    expect(titles).toContain("MacBook Air M3");
    expect(titles).not.toContain("Unreleased Pixel Fold");
  });

  it("does not let a customer reveal drafts via ?status=draft", async () => {
    const { authHeader: adminAuth } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    await seedProducts(adminAuth);
    const { authHeader: customerAuth } = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .get(`${API}/products?status=draft`)
      .set("Authorization", customerAuth);

    expect(response.status).toBe(200);
    expect(response.body.data.products).toHaveLength(2);
    expect(
      response.body.data.products.every((product) => product.status === PRODUCT_STATUS.ACTIVE)
    ).toBe(true);
  });

  it("shows drafts to an admin", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    await seedProducts(authHeader);

    const response = await request(app)
      .get(`${API}/products?status=draft`)
      .set("Authorization", authHeader);

    expect(response.body.data.products).toHaveLength(1);
    expect(response.body.data.products[0].title).toBe("Unreleased Pixel Fold");
  });

  it("includes descendant categories when filtering by an ancestor slug", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    await seedProducts(authHeader);

    // The ROG is filed under Gaming, two levels below Electronics.
    const response = await request(app).get(`${API}/products?category=electronics`);
    const titles = response.body.data.products.map((product) => product.title);

    expect(titles).toContain("MacBook Air M3");
    expect(titles).toContain("ROG Strix G16");
  });

  it("finds products by full-text search", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    await seedProducts(authHeader);

    const byTitle = await request(app).get(`${API}/products?search=MacBook`);
    expect(byTitle.status).toBe(200);
    expect(byTitle.body.data.products.map((p) => p.title)).toEqual(["MacBook Air M3"]);

    // The text index covers brand and tags too, not just the title.
    const byBrand = await request(app).get(`${API}/products?search=ASUS`);
    expect(byBrand.body.data.products.map((p) => p.title)).toEqual(["ROG Strix G16"]);
  });

  it("keeps drafts out of search results", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    await seedProducts(authHeader);

    const response = await request(app).get(`${API}/products?search=Pixel`);

    expect(response.status).toBe(200);
    expect(response.body.data.products).toHaveLength(0);
  });

  it("filters by price range in minor units", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    await seedProducts(authHeader);

    const response = await request(app).get(`${API}/products?maxPrice=17000000`);

    expect(response.body.data.products).toHaveLength(1);
    expect(response.body.data.products[0].title).toBe("MacBook Air M3");
  });

  it("returns pagination metadata", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    await seedProducts(authHeader);

    const response = await request(app).get(`${API}/products?page=1&limit=1`);

    expect(response.body.meta).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
      hasNextPage: true,
      hasPrevPage: false,
    });
  });

  it("rejects a decimal price", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const { laptops } = await seedTree(authHeader);

    const response = await request(app)
      .post(`${API}/products`)
      .set("Authorization", authHeader)
      .send({ title: "Rounding Bug", category: laptops.id, price: 1999.99, stock: 1 });

    expect(response.status).toBe(422);
  });

  it("rejects a compareAtPrice that is not above the live price", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const { laptops } = await seedTree(authHeader);

    const response = await request(app)
      .post(`${API}/products`)
      .set("Authorization", authHeader)
      .send({
        title: "Fake Discount",
        category: laptops.id,
        price: 10000,
        compareAtPrice: 9000,
        stock: 1,
      });

    expect(response.status).toBe(422);
  });

  it("archives instead of hard-deleting", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const { active } = await seedProducts(authHeader);

    const response = await request(app)
      .delete(`${API}/products/${active.id}`)
      .set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.product.status).toBe(PRODUCT_STATUS.ARCHIVED);

    // Gone from the public catalog, still present for order history.
    const publicList = await request(app).get(`${API}/products`);
    expect(publicList.body.data.products.map((p) => p.title)).not.toContain("MacBook Air M3");
  });
});

describe("stock adjustment", () => {
  it("applies a signed delta", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const { laptops } = await seedTree(authHeader);

    const created = await request(app)
      .post(`${API}/products`)
      .set("Authorization", authHeader)
      .send({ title: "Stock Test", category: laptops.id, price: 1000, stock: 5 });

    const response = await request(app)
      .post(`${API}/products/${created.body.data.product.id}/stock`)
      .set("Authorization", authHeader)
      .send({ delta: -2 });

    expect(response.status).toBe(200);
    expect(response.body.data.product.stock).toBe(3);
  });

  it("refuses to drive stock below zero", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const { laptops } = await seedTree(authHeader);

    const created = await request(app)
      .post(`${API}/products`)
      .set("Authorization", authHeader)
      .send({ title: "Scarce", category: laptops.id, price: 1000, stock: 2 });

    const response = await request(app)
      .post(`${API}/products/${created.body.data.product.id}/stock`)
      .set("Authorization", authHeader)
      .send({ delta: -5 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("INSUFFICIENT_STOCK");
  });

  it("cannot be oversold by concurrent decrements", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const { laptops } = await seedTree(authHeader);

    const created = await request(app)
      .post(`${API}/products`)
      .set("Authorization", authHeader)
      .send({ title: "Last One", category: laptops.id, price: 1000, stock: 1 });

    const productId = created.body.data.product.id;

    // Ten simultaneous attempts to take the single remaining unit. The
    // conditional $inc means exactly one may win.
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post(`${API}/products/${productId}/stock`)
          .set("Authorization", authHeader)
          .send({ delta: -1 })
      )
    );

    const succeeded = results.filter((response) => response.status === 200);
    const conflicted = results.filter((response) => response.status === 409);

    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(9);
    expect(succeeded[0].body.data.product.stock).toBe(0);
  });
});
