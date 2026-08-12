"use strict";

const mongoose = require("mongoose");
// Requiring the app registers every model.
require("../src/app");

/**
 * Indexes are easy to lose silently: a schema-level `index()` call that never
 * reaches the database costs nothing at boot, passes every functional test on
 * a small dataset, and only shows up as a collection scan under load - or, in
 * the case of a unique index, as duplicate data that should never have been
 * accepted.
 *
 * These assertions run against the real database the suite connects to, so
 * they fail if index creation is skipped or misconfigured.
 */
async function indexNames(modelName) {
  const indexes = await mongoose.model(modelName).collection.indexes();
  return indexes.map((index) => index.name);
}

async function indexByKey(modelName, key) {
  const indexes = await mongoose.model(modelName).collection.indexes();
  return indexes.find((index) => JSON.stringify(index.key) === JSON.stringify(key));
}

describe("database indexes", () => {
  it("expires pending registrations via a TTL index", async () => {
    const indexes = await mongoose.model("PendingRegistration").collection.indexes();
    const ttl = indexes.find((index) => index.expireAfterSeconds !== undefined);

    // Without this, abandoned signups accumulate forever and keep squatting
    // on email addresses that were never confirmed.
    expect(ttl).toBeDefined();
    expect(ttl.key).toEqual({ expiresAt: 1 });
    expect(ttl.expireAfterSeconds).toBe(0);
  });

  it("builds more than the default _id index on every collection", async () => {
    for (const modelName of ["User", "Category", "Product"]) {
      const names = await indexNames(modelName);
      expect(names.length).toBeGreaterThan(1);
    }
  });

  it("enforces unique email on users", async () => {
    const index = await indexByKey("User", { email: 1 });

    expect(index).toBeDefined();
    expect(index.unique).toBe(true);
  });

  it("enforces unique slugs on categories and products", async () => {
    expect((await indexByKey("Category", { slug: 1 })).unique).toBe(true);
    expect((await indexByKey("Product", { slug: 1 })).unique).toBe(true);
  });

  it("builds the weighted product text index that search depends on", async () => {
    const names = await indexNames("Product");

    expect(names).toContain("product_text_search");
  });

  it("builds the compound index backing category browsing", async () => {
    // Equality fields first, then the sort field - the order the default
    // catalog listing query actually needs.
    const index = await indexByKey("Product", { category: 1, status: 1, createdAt: -1 });

    expect(index).toBeDefined();
  });

  it("keeps sibling category names unique", async () => {
    const index = await indexByKey("Category", { parent: 1, name: 1 });

    expect(index).toBeDefined();
    expect(index.unique).toBe(true);
  });
});

describe("unique constraints are actually enforced", () => {
  it("rejects a duplicate user email at the database level", async () => {
    const User = mongoose.model("User");

    await User.create({
      firstName: "First",
      lastName: "User",
      email: "dupe@test.dev",
      password: "Passw0rd!",
    });

    await expect(
      User.create({
        firstName: "Second",
        lastName: "User",
        email: "dupe@test.dev",
        password: "Passw0rd!",
      })
    ).rejects.toMatchObject({ code: 11000 });
  });
});
