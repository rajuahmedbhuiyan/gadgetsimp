"use strict";

const request = require("supertest");
const mongoose = require("mongoose");
const createApp = require("../src/app");
const Category = require("../src/modules/category/category.model");
const Product = require("../src/modules/product/product.model");
const Variant = require("../src/modules/product/variant.model");
const Cart = require("../src/modules/cart/cart.model");
const { API, createUserAndLogin } = require("./helpers");

const app = createApp();

/**
 * Fixtures are built through the models directly rather than the product
 * service, because these tests are about stock and availability and need to
 * set exact quantities and states - including ones the service would refuse to
 * create.
 */
async function makeProduct(overrides = {}) {
  const category = await Category.findOne({ slug: "cart-fixtures" }).lean();

  return Product.create({
    name: "Sports T-Shirt",
    slug: `product-${new mongoose.Types.ObjectId()}`,
    description: "A cart fixture",
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

async function makeVariant(product, overrides = {}) {
  return Variant.create({
    productId: product._id,
    sku: `SKU-${new mongoose.Types.ObjectId()}`,
    options: { color: "black", size: "m" },
    sellingPrice: 1200,
    status: "ACTIVE",
    stock: { quantity: 5, trackInventory: true, allowBackorder: false },
    ...overrides,
  });
}

function cartApi(token) {
  return {
    get: () => request(app).get(`${API}/cart`).set("Authorization", token),
    count: () => request(app).get(`${API}/cart/count`).set("Authorization", token),
    add: (body) => request(app).post(`${API}/cart/items`).set("Authorization", token).send(body),
    update: (body) => request(app).patch(`${API}/cart/items`).set("Authorization", token).send(body),
    remove: (body) => request(app).delete(`${API}/cart/items`).set("Authorization", token).send(body),
    clear: () => request(app).delete(`${API}/cart`).set("Authorization", token),
  };
}

let shopper;
let api;

beforeEach(async () => {
  await Category.create({ name: "Cart Fixtures", slug: "cart-fixtures", status: "ACTIVE" });
  shopper = await createUserAndLogin(app);
  api = cartApi(shopper.authHeader);
});

describe("cart access", () => {
  it("refuses every route without a token", async () => {
    const calls = [
      request(app).get(`${API}/cart`),
      request(app).get(`${API}/cart/count`),
      request(app).post(`${API}/cart/items`).send({ items: [] }),
      request(app).patch(`${API}/cart/items`).send({ items: [] }),
      request(app).delete(`${API}/cart/items`).send({ itemIds: [] }),
      request(app).delete(`${API}/cart`),
    ];

    for (const response of await Promise.all(calls)) {
      expect(response.status).toBe(401);
    }
  });

  it("keeps each shopper's cart to themselves", async () => {
    const product = await makeProduct();
    await api.add({ items: [{ productId: String(product._id), quantity: 2 }] });

    const other = await createUserAndLogin(app);
    const response = await cartApi(other.authHeader).get();

    expect(response.status).toBe(200);
    expect(response.body.data.cart.items).toEqual([]);
  });

  it("returns an empty cart without creating a row for a shopper who only browsed", async () => {
    const response = await api.get();

    expect(response.status).toBe(200);
    expect(response.body.data.cart).toMatchObject({
      items: [],
      summary: { itemCount: 0, totalQuantity: 0, subtotal: 0, checkoutReady: false },
    });
    expect(await Cart.countDocuments({})).toBe(0);
  });
});

describe("adding items", () => {
  it("adds a batch of several products in one call", async () => {
    const [first, second] = await Promise.all([makeProduct(), makeProduct()]);

    const response = await api.add({
      items: [
        { productId: String(first._id), quantity: 2 },
        { productId: String(second._id), quantity: 1 },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.data.cart.items).toHaveLength(2);
    expect(response.body.data.cart.summary).toMatchObject({
      itemCount: 2,
      totalQuantity: 3,
      subtotal: 3000,
      checkoutReady: true,
    });
  });

  it("merges a repeat add into the existing line instead of duplicating it", async () => {
    const product = await makeProduct();
    const id = String(product._id);

    await api.add({ items: [{ productId: id, quantity: 2 }] });
    const response = await api.add({ items: [{ productId: id, quantity: 3 }] });

    expect(response.body.data.cart.items).toHaveLength(1);
    expect(response.body.data.cart.items[0].quantity).toBe(5);
  });

  it("sums the same product sent twice in one batch rather than rejecting it", async () => {
    const product = await makeProduct();
    const id = String(product._id);

    const response = await api.add({
      items: [
        { productId: id, quantity: 1 },
        { productId: id, quantity: 2 },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.data.cart.items).toHaveLength(1);
    expect(response.body.data.cart.items[0].quantity).toBe(3);
  });

  it("defaults quantity to 1", async () => {
    const product = await makeProduct();

    const response = await api.add({ items: [{ productId: String(product._id) }] });

    expect(response.body.data.cart.items[0].quantity).toBe(1);
  });

  it("rejects the whole batch when one item is unavailable", async () => {
    const good = await makeProduct();
    const draft = await makeProduct({ status: "DRAFT", publishedAt: null });

    const response = await api.add({
      items: [
        { productId: String(good._id), quantity: 1 },
        { productId: String(draft._id), quantity: 1 },
      ],
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("CART_ITEMS_INVALID");
    expect(response.body.errors).toEqual([
      expect.objectContaining({ field: "items.1.productId", code: "PRODUCT_UNAVAILABLE" }),
    ]);

    // Nothing was applied - the good item did not sneak through.
    const cart = await api.get();
    expect(cart.body.data.cart.items).toEqual([]);
  });

  it("refuses an out-of-stock product", async () => {
    const product = await makeProduct({ stock: { quantity: 0, trackInventory: true } });

    const response = await api.add({ items: [{ productId: String(product._id), quantity: 1 }] });

    expect(response.status).toBe(422);
    expect(response.body.errors[0]).toMatchObject({ code: "OUT_OF_STOCK" });
  });

  it("caps the quantity at remaining stock and reports the adjustment", async () => {
    const product = await makeProduct({ stock: { quantity: 3, trackInventory: true } });

    const response = await api.add({ items: [{ productId: String(product._id), quantity: 10 }] });

    expect(response.status).toBe(200);
    expect(response.body.data.cart.items[0].quantity).toBe(3);
    expect(response.body.data.adjustments).toEqual([
      expect.objectContaining({ requested: 10, applied: 3, code: "QUANTITY_ADJUSTED" }),
    ]);
  });

  /**
   * The reason `optimisticConcurrency` is on the cart schema. Both requests
   * read the same cart, and without version checking the second would overwrite
   * the first's increment - the classic lost update, and one a user produces
   * simply by double-tapping "add to cart".
   */
  it("does not lose an increment when two adds race", async () => {
    const product = await makeProduct({ stock: { trackInventory: false } });
    const body = { items: [{ productId: String(product._id), quantity: 1 }] };

    const [first, second] = await Promise.all([api.add(body), api.add(body)]);

    expect([first.status, second.status]).toEqual([200, 200]);

    const cart = await api.get();
    expect(cart.body.data.cart.items).toHaveLength(1);
    expect(cart.body.data.cart.items[0].quantity).toBe(2);
  });

  it("rejects a batch larger than the cap", async () => {
    const product = await makeProduct();

    const response = await api.add({
      items: Array.from({ length: 51 }, () => ({ productId: String(product._id), quantity: 1 })),
    });

    expect(response.status).toBe(422);
  });

  it("does not cap a product that does not track inventory", async () => {
    const product = await makeProduct({ stock: { trackInventory: false } });

    const response = await api.add({ items: [{ productId: String(product._id), quantity: 40 }] });

    expect(response.body.data.cart.items[0].quantity).toBe(40);
    expect(response.body.data.cart.items[0].availability.maxQuantity).toBeNull();
    expect(response.body.data.adjustments).toEqual([]);
  });
});

describe("variations", () => {
  it("requires a variant for a variable product", async () => {
    const product = await makeProduct({ productType: "VARIABLE" });
    await makeVariant(product);

    const response = await api.add({ items: [{ productId: String(product._id), quantity: 1 }] });

    expect(response.status).toBe(422);
    expect(response.body.errors[0]).toMatchObject({
      field: "items.0.variantId",
      code: "VARIANT_REQUIRED",
    });
  });

  it("refuses a variant on a simple product", async () => {
    const simple = await makeProduct();
    const other = await makeProduct({ productType: "VARIABLE" });
    const variant = await makeVariant(other);

    const response = await api.add({
      items: [{ productId: String(simple._id), variantId: String(variant._id), quantity: 1 }],
    });

    expect(response.status).toBe(422);
    expect(response.body.errors[0]).toMatchObject({ code: "VARIANT_NOT_ALLOWED" });
  });

  it("refuses a variant belonging to a different product", async () => {
    const product = await makeProduct({ productType: "VARIABLE" });
    await makeVariant(product);
    const stranger = await makeProduct({ productType: "VARIABLE" });
    const strayVariant = await makeVariant(stranger);

    const response = await api.add({
      items: [{ productId: String(product._id), variantId: String(strayVariant._id), quantity: 1 }],
    });

    expect(response.status).toBe(422);
    expect(response.body.errors[0]).toMatchObject({ code: "VARIANT_PRODUCT_MISMATCH" });
  });

  it("keeps two variants of one product as separate lines", async () => {
    const product = await makeProduct({ productType: "VARIABLE" });
    const black = await makeVariant(product, { options: { color: "black", size: "m" } });
    const white = await makeVariant(product, {
      options: { color: "white", size: "l" },
      sellingPrice: 1400,
    });

    const response = await api.add({
      items: [
        { productId: String(product._id), variantId: String(black._id), quantity: 1 },
        { productId: String(product._id), variantId: String(white._id), quantity: 2 },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.data.cart.items).toHaveLength(2);

    // Priced from the variant, not the parent product's 1000.
    expect(response.body.data.cart.summary.subtotal).toBe(1200 + 2 * 1400);

    const labels = response.body.data.cart.items.map((item) => item.variant.label).sort();
    expect(labels).toEqual(["black / m", "white / l"]);
  });

  it("takes stock from the variant, not the product", async () => {
    // The product looks amply stocked; the chosen SKU does not.
    const product = await makeProduct({
      productType: "VARIABLE",
      stock: { quantity: 500, trackInventory: true },
    });
    const variant = await makeVariant(product, { stock: { quantity: 2, trackInventory: true } });

    const response = await api.add({
      items: [{ productId: String(product._id), variantId: String(variant._id), quantity: 9 }],
    });

    expect(response.body.data.cart.items[0].quantity).toBe(2);
    expect(response.body.data.cart.items[0].availability.maxQuantity).toBe(2);
    expect(response.body.data.adjustments[0]).toMatchObject({ requested: 9, applied: 2 });
  });

  it("refuses a withdrawn variant", async () => {
    const product = await makeProduct({ productType: "VARIABLE" });
    const variant = await makeVariant(product, { deletedAt: new Date() });

    const response = await api.add({
      items: [{ productId: String(product._id), variantId: String(variant._id), quantity: 1 }],
    });

    expect(response.status).toBe(422);
    expect(response.body.errors[0]).toMatchObject({ code: "VARIANT_UNAVAILABLE" });
  });
});

describe("updating items", () => {
  async function cartWithTwoLines() {
    const [first, second] = await Promise.all([makeProduct(), makeProduct()]);
    const response = await api.add({
      items: [
        { productId: String(first._id), quantity: 1 },
        { productId: String(second._id), quantity: 1 },
      ],
    });

    return { first, second, items: response.body.data.cart.items };
  }

  it("updates several lines at once", async () => {
    const { items } = await cartWithTwoLines();

    const response = await api.update({
      items: [
        { itemId: items[0].id, quantity: 4 },
        { itemId: items[1].id, quantity: 2 },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.data.cart.summary.totalQuantity).toBe(6);
  });

  it("removes a line when the quantity is set to zero", async () => {
    const { items } = await cartWithTwoLines();

    const response = await api.update({
      items: [
        { itemId: items[0].id, quantity: 0 },
        { itemId: items[1].id, quantity: 3 },
      ],
    });

    expect(response.body.data.cart.items).toHaveLength(1);
    expect(response.body.data.cart.items[0].id).toBe(items[1].id);
    expect(response.body.data.cart.items[0].quantity).toBe(3);
  });

  it("caps an update at remaining stock", async () => {
    const product = await makeProduct({ stock: { quantity: 4, trackInventory: true } });
    const added = await api.add({ items: [{ productId: String(product._id), quantity: 1 }] });

    const response = await api.update({
      items: [{ itemId: added.body.data.cart.items[0].id, quantity: 50 }],
    });

    expect(response.body.data.cart.items[0].quantity).toBe(4);
    expect(response.body.data.adjustments[0]).toMatchObject({ requested: 50, applied: 4 });
  });

  it("refuses the batch when an itemId is not in the cart", async () => {
    const { items } = await cartWithTwoLines();
    const ghost = String(new mongoose.Types.ObjectId());

    const response = await api.update({
      items: [
        { itemId: items[0].id, quantity: 5 },
        { itemId: ghost, quantity: 2 },
      ],
    });

    expect(response.status).toBe(422);
    expect(response.body.errors).toEqual([
      expect.objectContaining({ field: "items.1.itemId", code: "CART_ITEM_NOT_FOUND" }),
    ]);

    // The valid half was not applied either.
    const cart = await api.get();
    expect(cart.body.data.cart.summary.totalQuantity).toBe(2);
  });

  it("refuses a batch that names the same line twice", async () => {
    const { items } = await cartWithTwoLines();

    const response = await api.update({
      items: [
        { itemId: items[0].id, quantity: 2 },
        { itemId: items[0].id, quantity: 5 },
      ],
    });

    expect(response.status).toBe(422);
  });
});

describe("removing items and clearing", () => {
  it("removes several lines in one call", async () => {
    const [a, b, c] = await Promise.all([makeProduct(), makeProduct(), makeProduct()]);
    const added = await api.add({
      items: [a, b, c].map((product) => ({ productId: String(product._id), quantity: 1 })),
    });
    const ids = added.body.data.cart.items.map((item) => item.id);

    const response = await api.remove({ itemIds: [ids[0], ids[2]] });

    expect(response.status).toBe(200);
    expect(response.body.data.removed).toBe(2);
    expect(response.body.data.notFound).toEqual([]);
    expect(response.body.data.cart.items.map((item) => item.id)).toEqual([ids[1]]);
  });

  it("treats an already-removed id as success", async () => {
    const product = await makeProduct();
    const added = await api.add({ items: [{ productId: String(product._id), quantity: 1 }] });
    const id = added.body.data.cart.items[0].id;

    await api.remove({ itemIds: [id] });
    const response = await api.remove({ itemIds: [id] });

    expect(response.status).toBe(200);
    expect(response.body.data.removed).toBe(0);
    expect(response.body.data.notFound).toEqual([id]);
  });

  it("clears everything", async () => {
    const [a, b] = await Promise.all([makeProduct(), makeProduct()]);
    await api.add({
      items: [a, b].map((product) => ({ productId: String(product._id), quantity: 2 })),
    });

    const response = await api.clear();

    expect(response.status).toBe(200);
    expect(response.body.data.cart.items).toEqual([]);
    expect(response.body.data.cart.summary.totalQuantity).toBe(0);

    // Idempotent.
    expect((await api.clear()).status).toBe(200);
  });
});

describe("reading a cart the catalog has moved on from", () => {
  it("flags a product withdrawn after it was added instead of failing", async () => {
    const product = await makeProduct();
    await api.add({ items: [{ productId: String(product._id), quantity: 2 }] });

    await Product.updateOne({ _id: product._id }, { $set: { status: "DRAFT" } });

    const response = await api.get();

    expect(response.status).toBe(200);
    const [line] = response.body.data.cart.items;
    expect(line.availability.purchasable).toBe(false);
    expect(line.issues[0].code).toBe("PRODUCT_UNAVAILABLE");
    // Still identifiable, so the row can name what to remove.
    expect(line.product.name).toBe("Sports T-Shirt");
    expect(response.body.data.cart.summary).toMatchObject({
      unavailableCount: 1,
      subtotal: 0,
      checkoutReady: false,
      // The badge still counts it - it is sitting in the cart.
      totalQuantity: 2,
    });
  });

  it("flags a line holding more units than remain", async () => {
    const product = await makeProduct({ stock: { quantity: 5, trackInventory: true } });
    await api.add({ items: [{ productId: String(product._id), quantity: 5 }] });

    await Product.updateOne({ _id: product._id }, { $set: { "stock.quantity": 2 } });

    const [line] = (await api.get()).body.data.cart.items;

    expect(line.availability).toMatchObject({ purchasable: false, inStock: true, maxQuantity: 2 });
    expect(line.issues[0]).toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });

  it("reports a price change since the item was added", async () => {
    const product = await makeProduct();
    await api.add({ items: [{ productId: String(product._id), quantity: 1 }] });

    await Product.updateOne({ _id: product._id }, { $set: { sellingPrice: 1500 } });

    const [line] = (await api.get()).body.data.cart.items;

    expect(line.unitPrice).toBe(1500);
    expect(line.issues).toEqual([
      expect.objectContaining({ code: "PRICE_CHANGED" }),
    ]);
  });

  it("still lets a shopper reduce or remove an unavailable line", async () => {
    const product = await makeProduct();
    const added = await api.add({ items: [{ productId: String(product._id), quantity: 3 }] });
    const id = added.body.data.cart.items[0].id;

    await Product.updateOne({ _id: product._id }, { $set: { deletedAt: new Date() } });

    expect((await api.update({ items: [{ itemId: id, quantity: 1 }] })).status).toBe(200);
    expect((await api.remove({ itemIds: [id] })).body.data.removed).toBe(1);
  });
});

describe("pricing and counts", () => {
  it("totals discounts across lines", async () => {
    const product = await makeProduct({ sellingPrice: 800, originalPrice: 1000 });

    const response = await api.add({ items: [{ productId: String(product._id), quantity: 3 }] });

    expect(response.body.data.cart.items[0]).toMatchObject({
      unitPrice: 800,
      originalPrice: 1000,
      discountPercent: 20,
      lineTotal: 2400,
      originalLineTotal: 3000,
    });
    expect(response.body.data.cart.summary).toMatchObject({
      subtotal: 2400,
      originalSubtotal: 3000,
      discount: 600,
    });
  });

  it("answers the badge without pricing anything", async () => {
    const [a, b] = await Promise.all([makeProduct(), makeProduct()]);
    await api.add({
      items: [
        { productId: String(a._id), quantity: 2 },
        { productId: String(b._id), quantity: 3 },
      ],
    });

    const response = await api.count();

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ itemCount: 2, totalQuantity: 5 });
  });
});
