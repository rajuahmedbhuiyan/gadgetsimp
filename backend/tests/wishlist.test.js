"use strict";

const request = require("supertest");
const mongoose = require("mongoose");
const createApp = require("../src/app");
const Category = require("../src/modules/category/category.model");
const Product = require("../src/modules/product/product.model");
const Variant = require("../src/modules/product/variant.model");
const Wishlist = require("../src/modules/wishlist/wishlist.model");
const { API, createUserAndLogin } = require("./helpers");

const app = createApp();

async function makeProduct(overrides = {}) {
  const category = await Category.findOne({ slug: "wishlist-fixtures" }).lean();

  return Product.create({
    name: "Sports T-Shirt",
    slug: `product-${new mongoose.Types.ObjectId()}`,
    description: "A wishlist fixture",
    categoryIds: [category._id],
    productType: "SIMPLE",
    status: "ACTIVE",
    visibility: "PUBLIC",
    publishedAt: new Date(),
    sellingPrice: 1000,
    thumbnail: { alt: "Shirt", src: "https://cdn.example.com/shirt.webp" },
    stock: { quantity: 10, trackInventory: true, allowBackorder: false },
    ...overrides,
  });
}

function wishlistApi(token) {
  return {
    add: (productIds) =>
      request(app).post(`${API}/wishlist/items`).set("Authorization", token).send({ productIds }),
    remove: (productIds) =>
      request(app).delete(`${API}/wishlist/items`).set("Authorization", token).send({ productIds }),
    toggle: (productId) =>
      request(app).post(`${API}/wishlist/toggle`).set("Authorization", token).send({ productId }),
    filter: (body = {}) =>
      request(app).post(`${API}/wishlist/filter`).set("Authorization", token).send(body),
    ids: () => request(app).get(`${API}/wishlist/ids`).set("Authorization", token),
    clear: () => request(app).delete(`${API}/wishlist`).set("Authorization", token),
  };
}

let shopper;
let api;

beforeEach(async () => {
  await Category.create({ name: "Wishlist Fixtures", slug: "wishlist-fixtures", status: "ACTIVE" });
  shopper = await createUserAndLogin(app);
  api = wishlistApi(shopper.authHeader);
});

describe("access", () => {
  it("refuses every route without a token", async () => {
    const calls = [
      request(app).post(`${API}/wishlist/filter`).send({}),
      request(app).get(`${API}/wishlist/ids`),
      request(app).post(`${API}/wishlist/items`).send({ productIds: [] }),
      request(app).delete(`${API}/wishlist/items`).send({ productIds: [] }),
      request(app).post(`${API}/wishlist/toggle`).send({}),
      request(app).delete(`${API}/wishlist`),
    ];

    for (const response of await Promise.all(calls)) {
      expect(response.status).toBe(401);
    }
  });

  it("keeps each shopper's list to themselves", async () => {
    const product = await makeProduct();
    await api.add([String(product._id)]);

    const other = await createUserAndLogin(app);
    const theirs = wishlistApi(other.authHeader);

    expect((await theirs.ids()).body.data.productIds).toEqual([]);
    expect((await theirs.filter()).body.data.items).toEqual([]);
  });
});

describe("saving products", () => {
  it("saves a batch", async () => {
    const [a, b] = await Promise.all([makeProduct(), makeProduct()]);

    const response = await api.add([String(a._id), String(b._id)]);

    expect(response.status).toBe(200);
    expect(response.body.data.added).toHaveLength(2);
    expect(response.body.data.alreadySaved).toEqual([]);
    expect(response.body.data.total).toBe(2);
  });

  it("treats re-saving as a no-op rather than an error", async () => {
    const product = await makeProduct();
    const id = String(product._id);

    await api.add([id]);
    const again = await api.add([id]);

    expect(again.status).toBe(200);
    expect(again.body.data.added).toEqual([]);
    expect(again.body.data.alreadySaved).toEqual([id]);
    expect(again.body.data.total).toBe(1);
    expect(await Wishlist.countDocuments({ userId: shopper.id })).toBe(1);
  });

  it("collapses a duplicate inside one batch", async () => {
    const product = await makeProduct();
    const id = String(product._id);

    const response = await api.add([id, id]);

    expect(response.body.data.total).toBe(1);
  });

  it("refuses the whole batch when a product is not available", async () => {
    const good = await makeProduct();
    const draft = await makeProduct({ status: "DRAFT", publishedAt: null });

    const response = await api.add([String(good._id), String(draft._id)]);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("WISHLIST_ITEMS_INVALID");
    expect(response.body.errors).toEqual([
      expect.objectContaining({ field: "productIds.1", code: "PRODUCT_UNAVAILABLE" }),
    ]);
    expect(await Wishlist.countDocuments({ userId: shopper.id })).toBe(0);
  });

  /**
   * The deliberate difference from the cart: saving something *because* it is
   * unavailable today is half the point of a wishlist, so stock is not a gate.
   */
  it("saves an out-of-stock product, which the cart would refuse", async () => {
    const product = await makeProduct({ stock: { quantity: 0, trackInventory: true } });

    const saved = await api.add([String(product._id)]);
    expect(saved.status).toBe(200);

    const carted = await request(app)
      .post(`${API}/cart/items`)
      .set("Authorization", shopper.authHeader)
      .send({ items: [{ productId: String(product._id), quantity: 1 }] });

    expect(carted.status).toBe(422);
  });

  it("takes no variant", async () => {
    const product = await makeProduct({ productType: "VARIABLE" });
    const variant = await Variant.create({
      productId: product._id,
      sku: `SKU-${new mongoose.Types.ObjectId()}`,
      options: { color: "black", size: "m" },
      sellingPrice: 1200,
      status: "ACTIVE",
      stock: { quantity: 5, trackInventory: true },
    });

    // A variable product is saved by product alone - no variant needed...
    expect((await api.add([String(product._id)])).status).toBe(200);

    // ...and the field does not exist, so sending one is rejected outright.
    const withVariant = await request(app)
      .post(`${API}/wishlist/items`)
      .set("Authorization", shopper.authHeader)
      .send({ productIds: [String(product._id)], variantId: String(variant._id) });

    expect(withVariant.status).toBe(422);
  });
});

describe("removing", () => {
  it("removes a batch and ignores ids that are not there", async () => {
    const [a, b] = await Promise.all([makeProduct(), makeProduct()]);
    await api.add([String(a._id), String(b._id)]);

    const ghost = String(new mongoose.Types.ObjectId());
    const response = await api.remove([String(a._id), ghost]);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ removed: 1, total: 1 });

    // Idempotent - removing it again succeeds and removes nothing.
    expect((await api.remove([String(a._id)])).body.data.removed).toBe(0);
  });

  it("clears everything", async () => {
    const [a, b] = await Promise.all([makeProduct(), makeProduct()]);
    await api.add([String(a._id), String(b._id)]);

    const response = await api.clear();

    expect(response.body.data).toEqual({ removed: 2, total: 0 });
    expect((await api.clear()).status).toBe(200);
  });
});

describe("the heart icon", () => {
  it("saves then unsaves the same product", async () => {
    const product = await makeProduct();
    const id = String(product._id);

    const on = await api.toggle(id);
    expect(on.body.data).toEqual({ productId: id, inWishlist: true, total: 1 });

    const off = await api.toggle(id);
    expect(off.body.data).toEqual({ productId: id, inWishlist: false, total: 0 });
  });

  it("removes a product that has since been withdrawn", async () => {
    const product = await makeProduct();
    const id = String(product._id);
    await api.add([id]);

    await Product.updateOne({ _id: product._id }, { $set: { status: "DRAFT" } });

    // Saving it now would be refused, but un-saving must still work or the row
    // is stuck on the list forever.
    const response = await api.toggle(id);

    expect(response.status).toBe(200);
    expect(response.body.data.inWishlist).toBe(false);
  });

  it("refuses to save an unavailable product", async () => {
    const product = await makeProduct({ status: "DRAFT", publishedAt: null });

    const response = await api.toggle(String(product._id));

    expect(response.status).toBe(422);
    expect(response.body.errors[0]).toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
  });
});

describe("the id list", () => {
  it("returns just ids, newest saved first", async () => {
    const [a, b] = await Promise.all([makeProduct(), makeProduct()]);

    await api.add([String(a._id)]);
    await api.add([String(b._id)]);

    const response = await api.ids();

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(2);
    expect(response.body.data.productIds).toEqual([String(b._id), String(a._id)]);
  });

  it("still lists a product that has been withdrawn", async () => {
    const product = await makeProduct();
    await api.add([String(product._id)]);

    await Product.updateOne({ _id: product._id }, { $set: { status: "DRAFT" } });

    // The heart on that product page should still read as saved.
    expect((await api.ids()).body.data.productIds).toEqual([String(product._id)]);
  });
});

describe("the listing", () => {
  it("returns product info alongside each saved item", async () => {
    const product = await makeProduct({ sellingPrice: 800, originalPrice: 1000 });
    await api.add([String(product._id)]);

    const response = await api.filter();

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);

    const [item] = response.body.data.items;
    expect(item).toMatchObject({
      id: String(product._id),
      name: "Sports T-Shirt",
      sellingPrice: 800,
      originalPrice: 1000,
      discountPercent: 20,
      inStock: true,
      available: true,
      currency: "BDT",
    });
    expect(item.thumbnail).toMatchObject({ src: "https://cdn.example.com/shirt.webp" });
    expect(item.addedAt).toBeTruthy();
    expect(item.pricing).toMatchObject({ min: 800, max: 800 });
  });

  it("paginates from page zero", async () => {
    const products = await Promise.all([makeProduct(), makeProduct(), makeProduct()]);
    await api.add(products.map((product) => String(product._id)));

    const response = await api.filter({ pagination: { page: 0, limit: 2 } });

    expect(response.body.data.items).toHaveLength(2);
    expect(response.body.meta).toMatchObject({
      page: 0,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPrevPage: false,
    });

    const second = await api.filter({ pagination: { page: 1, limit: 2 } });
    expect(second.body.data.items).toHaveLength(1);
    expect(second.body.meta).toMatchObject({ hasNextPage: false, hasPrevPage: true });
  });

  it("sorts by when it was saved, by price and by name", async () => {
    const cheap = await makeProduct({ name: "Anorak", sellingPrice: 300 });
    const dear = await makeProduct({ name: "Zip Hoodie", sellingPrice: 5000 });

    await api.add([String(dear._id)]);
    await api.add([String(cheap._id)]);

    const newest = await api.filter();
    expect(newest.body.data.items.map((item) => item.id)).toEqual([
      String(cheap._id),
      String(dear._id),
    ]);

    const byPrice = await api.filter({ sort: { field: "price", direction: "asc" } });
    expect(byPrice.body.data.items.map((item) => item.sellingPrice)).toEqual([300, 5000]);

    const byName = await api.filter({ sort: { field: "name", direction: "asc" } });
    expect(byName.body.data.items.map((item) => item.name)).toEqual(["Anorak", "Zip Hoodie"]);
  });

  it("filters by search, price and stock", async () => {
    const shirt = await makeProduct({ name: "Cotton Shirt", sellingPrice: 500 });
    const jacket = await makeProduct({
      name: "Winter Jacket",
      sellingPrice: 4000,
      stock: { quantity: 0, trackInventory: true },
    });
    await api.add([String(shirt._id), String(jacket._id)]);

    expect((await api.filter({ search: "shirt" })).body.data.items).toHaveLength(1);
    expect((await api.filter({ search: "nothing" })).body.data.items).toHaveLength(0);

    expect((await api.filter({ price: { max: 1000 } })).body.data.items).toHaveLength(1);
    expect((await api.filter({ price: { min: 100, max: 9000 } })).body.data.items).toHaveLength(2);

    const inStock = await api.filter({ inStock: true });
    expect(inStock.body.data.items.map((item) => item.id)).toEqual([String(shirt._id)]);

    const outOfStock = await api.filter({ inStock: false });
    expect(outOfStock.body.data.items.map((item) => item.id)).toEqual([String(jacket._id)]);
  });

  /**
   * Pins current behaviour, which is **not** what the docs promise.
   *
   * `CARD_PROJECTION` computes the range as
   * `$ifNull: ["$sellingPrice", <variant min>]`, and `sellingPrice` is
   * `required` on Product - so the variant fallback can never fire and
   * `pricing` always reports the product's own price, even when its variants
   * are priced differently. The shop cards have always behaved this way; the
   * wishlist inherits it by reusing the same projection.
   *
   * Swapping the two operands would fix it everywhere at once, but that
   * changes storefront price sorting and filtering, so it is a decision to
   * make deliberately rather than a side effect of adding a wishlist. This
   * test exists so the behaviour is recorded rather than rediscovered.
   */
  it("reports the product's own price even when variants differ (known quirk)", async () => {
    const product = await makeProduct({ productType: "VARIABLE", sellingPrice: 1000 });

    await Variant.create([
      {
        productId: product._id,
        sku: `SKU-A-${new mongoose.Types.ObjectId()}`,
        options: { size: "m" },
        sellingPrice: 1200,
        status: "ACTIVE",
        stock: { quantity: 3, trackInventory: true },
      },
      {
        productId: product._id,
        sku: `SKU-B-${new mongoose.Types.ObjectId()}`,
        options: { size: "l" },
        sellingPrice: 1600,
        status: "ACTIVE",
        stock: { quantity: 3, trackInventory: true },
      },
    ]);

    await api.add([String(product._id)]);

    const [item] = (await api.filter()).body.data.items;

    expect(item.productType).toBe("VARIABLE");
    // Variants are 1200 and 1600, so a true range would be {min:1200,max:1600}.
    expect(item.pricing).toMatchObject({ min: 1000, max: 1000, currency: "BDT" });

    // The storefront card agrees, which is the point - one projection, one
    // answer. When this is fixed, both move together.
    const shop = await request(app)
      .post(`${API}/shop`)
      .send({ pagination: { page: 0, limit: 20 } });
    const card = shop.body.data.products.find((entry) => entry.id === String(product._id));
    expect(card.pricing).toMatchObject({ min: 1000, max: 1000 });
  });

  /**
   * Same rule as the cart: a row the shopper cannot see is a row they can
   * never remove.
   */
  it("keeps a withdrawn product in the list, flagged", async () => {
    const kept = await makeProduct();
    const withdrawn = await makeProduct();
    await api.add([String(kept._id), String(withdrawn._id)]);

    await Product.updateOne({ _id: withdrawn._id }, { $set: { status: "DRAFT" } });

    const all = await api.filter();
    expect(all.body.data.items).toHaveLength(2);

    const flagged = all.body.data.items.find((item) => item.id === String(withdrawn._id));
    expect(flagged.available).toBe(false);
    // Still identifiable, so the row can name what it is offering to remove.
    expect(flagged.name).toBe("Sports T-Shirt");

    const filtered = await api.filter({ availableOnly: true });
    expect(filtered.body.data.items.map((item) => item.id)).toEqual([String(kept._id)]);

    // And it can still be removed.
    expect((await api.remove([String(withdrawn._id)])).body.data.removed).toBe(1);
  });

  it("survives a product being deleted outright", async () => {
    const product = await makeProduct();
    await api.add([String(product._id)]);

    await Product.deleteOne({ _id: product._id });

    const response = await api.filter();

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      id: String(product._id),
      available: false,
    });
    expect((await api.remove([String(product._id)])).body.data.removed).toBe(1);
  });
});
