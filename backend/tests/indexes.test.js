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
    for (const modelName of [
      "User",
      "PendingRegistration",
      "Attribute",
      "Category",
      "Brand",
      "Product",
      "Variant",
    ]) {
      const names = await indexNames(modelName);
      expect(names.length).toBeGreaterThan(1);
    }
  });

  it("enforces unique email on users", async () => {
    const index = await indexByKey("User", { email: 1 });

    expect(index).toBeDefined();
    expect(index.unique).toBe(true);
  });

  it("enforces catalog slug, attribute key and SKU uniqueness", async () => {
    for (const [modelName, key] of [
      ["Attribute", { key: 1 }],
      ["Category", { slug: 1 }],
      ["Brand", { slug: 1 }],
      ["Product", { slug: 1 }],
      ["Variant", { sku: 1 }],
    ]) {
      const index = await indexByKey(modelName, key);
      expect(index).toBeDefined();
      expect(index.unique).toBe(true);
    }
  });

  it("builds dynamic catalog attribute and option indexes", async () => {
    expect(await indexByKey("Product", { "attributes.$**": 1 })).toBeDefined();
    expect(await indexByKey("Variant", { "options.$**": 1 })).toBeDefined();
  });




});

describe("unique constraints are actually enforced", () => {
  it("rejects a duplicate user email at the database level", async () => {
    const User = mongoose.model("User");

    await User.create({
      fullName: "First User",
      email: "dupe@test.dev",
      password: "Passw0rd!",
    });

    await expect(
      User.create({
        fullName: "Second User",
        email: "dupe@test.dev",
        password: "Passw0rd!",
      })
    ).rejects.toMatchObject({ code: 11000 });
  });
});
