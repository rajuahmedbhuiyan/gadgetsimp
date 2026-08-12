"use strict";

const request = require("supertest");
const mongoose = require("mongoose");
const createApp = require("../src/app");
const Category = require("../src/modules/category/category.model");
const Product = require("../src/modules/product/product.model");
const Variant = require("../src/modules/product/variant.model");
const Order = require("../src/modules/order/order.model");
const Cart = require("../src/modules/cart/cart.model");
const { API, createUserAndLogin, verificationTokenFor, lastMessageTo } = require("./helpers");

const app = createApp();

async function makeProduct(overrides = {}) {
  const category = await Category.findOne({ slug: "order-fixtures" }).lean();

  return Product.create({
    name: "Sports T-Shirt",
    slug: `product-${new mongoose.Types.ObjectId()}`,
    description: "An order fixture",
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

const CONTACT = { name: "Rahim Uddin", phone: "+8801712345678" };
const ADDRESS = { line1: "House 42, Road 3", area: "Dhanmondi", city: "Dhaka", postalCode: "1209" };

function place(body, token) {
  const call = request(app).post(`${API}/orders`);
  if (token) call.set("Authorization", token);
  return call.send({ contact: CONTACT, shippingAddress: ADDRESS, ...body });
}

async function stockOf(product) {
  const fresh = await Product.findById(product._id).lean();
  return fresh.stock.quantity;
}

beforeEach(async () => {
  await Category.create({ name: "Order Fixtures", slug: "order-fixtures", status: "ACTIVE" });
});

describe("placing an order", () => {
  it("lets a guest order without an account", async () => {
    const product = await makeProduct();

    const response = await place({ items: [{ productId: String(product._id), quantity: 2 }] });

    expect(response.status).toBe(201);
    expect(response.body.data.order).toMatchObject({
      status: "PENDING",
      paymentMethod: "CASH_ON_DELIVERY",
      paymentStatus: "DUE",
      isGuestOrder: true,
      total: 2000,
    });
  });

  it("gives every order an integer id and a unique six-digit number", async () => {
    const product = await makeProduct({ stock: { trackInventory: false } });

    const first = await place({ items: [{ productId: String(product._id), quantity: 1 }] });
    const second = await place({ items: [{ productId: String(product._id), quantity: 1 }] });

    for (const response of [first, second]) {
      expect(Number.isInteger(response.body.data.order.id)).toBe(true);
      expect(response.body.data.order.orderNumber).toMatch(/^\d{6}$/);
    }

    expect(first.body.data.order.orderNumber).not.toBe(second.body.data.order.orderNumber);
    expect(second.body.data.order.id).toBe(first.body.data.order.id + 1);
  });

  it("requires contact details and an address", async () => {
    const product = await makeProduct();
    const items = [{ productId: String(product._id), quantity: 1 }];

    const noContact = await request(app)
      .post(`${API}/orders`)
      .send({ items, shippingAddress: ADDRESS });
    const noAddress = await request(app).post(`${API}/orders`).send({ items, contact: CONTACT });
    const noPhone = await request(app)
      .post(`${API}/orders`)
      .send({ items, contact: { name: "Rahim" }, shippingAddress: ADDRESS });
    const noCity = await request(app)
      .post(`${API}/orders`)
      .send({ items, contact: CONTACT, shippingAddress: { line1: "House 42" } });

    for (const response of [noContact, noAddress, noPhone, noCity]) {
      expect(response.status).toBe(422);
    }
  });

  it("accepts an order without a note", async () => {
    const product = await makeProduct();

    const response = await place({ items: [{ productId: String(product._id), quantity: 1 }] });

    expect(response.status).toBe(201);
    expect(response.body.data.order.note).toBeNull();
  });

  it("records the note when one is given", async () => {
    const product = await makeProduct();

    const response = await place({
      items: [{ productId: String(product._id), quantity: 1 }],
      note: "Please call before delivery",
    });

    expect(response.body.data.order.note).toBe("Please call before delivery");
  });

  it("stores the IP and parsed device the order came from", async () => {
    const product = await makeProduct();

    const response = await request(app)
      .post(`${API}/orders`)
      .set(
        "User-Agent",
        "Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
      )
      .send({
        contact: CONTACT,
        shippingAddress: ADDRESS,
        items: [{ productId: String(product._id), quantity: 1 }],
      });

    expect(response.status).toBe(201);

    const stored = await Order.findById(response.body.data.order.id).lean();
    expect(stored.client).toMatchObject({ os: "Android", browser: "Chrome", device: "MOBILE" });
    expect(stored.client.ip).toBeTruthy();
    expect(stored.client.userAgent).toContain("SM-G991B");
  });

  it("links the order to a signed-in customer and empties the ordered cart lines", async () => {
    const shopper = await createUserAndLogin(app);
    const [ordered, untouched] = await Promise.all([makeProduct(), makeProduct()]);

    await request(app)
      .post(`${API}/cart/items`)
      .set("Authorization", shopper.authHeader)
      .send({
        items: [
          { productId: String(ordered._id), quantity: 2 },
          { productId: String(untouched._id), quantity: 1 },
        ],
      });

    const response = await place(
      { items: [{ productId: String(ordered._id), quantity: 2 }] },
      shopper.authHeader
    );

    expect(response.status).toBe(201);
    expect(response.body.data.order.isGuestOrder).toBe(false);

    // Only what was ordered leaves the basket - the rest is still waiting.
    const cart = await Cart.findOne({ userId: shopper.id }).lean();
    expect(cart.items).toHaveLength(1);
    expect(String(cart.items[0].productId)).toBe(String(untouched._id));
  });
});

describe("price integrity", () => {
  /**
   * The attack this whole design exists to stop. Each of these is a client
   * trying to name its own price, and each must be **rejected**, not ignored -
   * a schema that silently dropped them would leave the door open to whoever
   * next reads `req.body`.
   */
  it.each([
    ["total", { total: 1 }],
    ["subtotal", { subtotal: 1 }],
    ["discount", { discount: 99999 }],
    ["shippingFee", { shippingFee: -500 }],
    ["status", { status: "DELIVERED" }],
    ["paymentStatus", { paymentStatus: "PAID" }],
    ["orderNumber", { orderNumber: "000001" }],
    ["userId", { userId: 1 }],
  ])("refuses a request that tries to set %s", async (_field, injection) => {
    const product = await makeProduct();

    const response = await place({
      items: [{ productId: String(product._id), quantity: 1 }],
      ...injection,
    });

    expect(response.status).toBe(422);
  });

  it("refuses a per-item price", async () => {
    const product = await makeProduct();

    const response = await place({
      items: [{ productId: String(product._id), quantity: 1, unitPrice: 1 }],
    });

    expect(response.status).toBe(422);
  });

  it("computes every figure from the catalog", async () => {
    const product = await makeProduct({ sellingPrice: 800, originalPrice: 1000 });

    const response = await place({ items: [{ productId: String(product._id), quantity: 3 }] });

    expect(response.body.data.order).toMatchObject({
      subtotal: 2400,
      discount: 600,
      shippingFee: 0,
      total: 2400,
      currency: "BDT",
    });
    expect(response.body.data.order.items[0]).toMatchObject({
      unitPrice: 800,
      originalPrice: 1000,
      quantity: 3,
      lineTotal: 2400,
    });
  });

  it("prices a variable product from its variant, not the parent", async () => {
    const product = await makeProduct({ productType: "VARIABLE", sellingPrice: 999 });
    const variant = await makeVariant(product, { sellingPrice: 1450 });

    const response = await place({
      items: [{ productId: String(product._id), variantId: String(variant._id), quantity: 2 }],
    });

    expect(response.body.data.order.total).toBe(2900);
    expect(response.body.data.order.items[0]).toMatchObject({
      unitPrice: 1450,
      variantLabel: "black / m",
      variantOptions: { color: "black", size: "m" },
    });
  });

  it("freezes the price against later catalog changes", async () => {
    const product = await makeProduct({ sellingPrice: 1000 });
    const placed = await place({ items: [{ productId: String(product._id), quantity: 1 }] });

    await Product.updateOne({ _id: product._id }, { $set: { sellingPrice: 5000 } });

    const stored = await Order.findById(placed.body.data.order.id).lean();
    expect(stored.items[0].unitPrice).toBe(1000);
    expect(stored.total).toBe(1000);
  });

  it("requires a variant for a variable product", async () => {
    const product = await makeProduct({ productType: "VARIABLE" });
    await makeVariant(product);

    const response = await place({ items: [{ productId: String(product._id), quantity: 1 }] });

    expect(response.status).toBe(422);
    expect(response.body.errors[0]).toMatchObject({
      field: "items.0.variantId",
      code: "VARIANT_REQUIRED",
    });
  });

  it("refuses a draft product", async () => {
    const product = await makeProduct({ status: "DRAFT", publishedAt: null });

    const response = await place({ items: [{ productId: String(product._id), quantity: 1 }] });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("ORDER_ITEMS_INVALID");
  });
});

describe("stock reservation", () => {
  it("takes the ordered units out of inventory", async () => {
    const product = await makeProduct({ stock: { quantity: 10, trackInventory: true } });

    await place({ items: [{ productId: String(product._id), quantity: 3 }] });

    expect(await stockOf(product)).toBe(7);
  });

  it("takes them from the variant when there is one", async () => {
    const product = await makeProduct({
      productType: "VARIABLE",
      stock: { quantity: 100, trackInventory: true },
    });
    const variant = await makeVariant(product, { stock: { quantity: 5, trackInventory: true } });

    await place({
      items: [{ productId: String(product._id), variantId: String(variant._id), quantity: 2 }],
    });

    expect((await Variant.findById(variant._id).lean()).stock.quantity).toBe(3);
    // The parent's own count is not what ships, so it must not move.
    expect(await stockOf(product)).toBe(100);
  });

  it("refuses an order for more than remains, rather than quietly reducing it", async () => {
    const product = await makeProduct({ stock: { quantity: 2, trackInventory: true } });

    const response = await place({ items: [{ productId: String(product._id), quantity: 5 }] });

    expect(response.status).toBe(422);
    expect(response.body.errors[0]).toMatchObject({
      field: "items.0.quantity",
      code: "INSUFFICIENT_STOCK",
    });
    // Nothing was taken.
    expect(await stockOf(product)).toBe(2);
    expect(await Order.countDocuments({})).toBe(0);
  });

  it("gives back the units it already took when a later line fails", async () => {
    const plenty = await makeProduct({ stock: { quantity: 10, trackInventory: true } });
    const scarce = await makeProduct({ stock: { quantity: 1, trackInventory: true } });

    const response = await place({
      items: [
        { productId: String(plenty._id), quantity: 4 },
        { productId: String(scarce._id), quantity: 9 },
      ],
    });

    expect(response.status).toBe(422);
    // The compensating release is what this asserts: the first line's units
    // must not stay held for an order that was never created.
    expect(await stockOf(plenty)).toBe(10);
    expect(await stockOf(scarce)).toBe(1);
  });

  it("leaves untracked inventory alone", async () => {
    const product = await makeProduct({ stock: { quantity: 4, trackInventory: false } });

    const response = await place({ items: [{ productId: String(product._id), quantity: 50 }] });

    expect(response.status).toBe(201);
    expect(await stockOf(product)).toBe(4);
    expect(response.body.data.order.items[0].quantity).toBe(50);
  });

  it("does not oversell when two orders race for the last units", async () => {
    const product = await makeProduct({ stock: { quantity: 3, trackInventory: true } });
    const body = { items: [{ productId: String(product._id), quantity: 2 }] };

    const [first, second] = await Promise.all([place(body), place(body)]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 422]);
    expect(await stockOf(product)).toBe(1);
  });
});

describe("idempotency", () => {
  it("returns the original order when a submission is retried", async () => {
    const product = await makeProduct({ stock: { trackInventory: false } });
    const body = {
      items: [{ productId: String(product._id), quantity: 1 }],
      idempotencyKey: "checkout-attempt-0001",
    };

    const first = await place(body);
    const second = await place(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.code).toBe("ORDER_ALREADY_PLACED");
    expect(second.body.data.order.id).toBe(first.body.data.order.id);
    expect(await Order.countDocuments({})).toBe(1);
  });

  /**
   * The key is namespaced to the caller server-side. Without that, guessing
   * somebody else's key would hand you their order as the "already placed"
   * response - an order-disclosure hole hiding inside a convenience feature.
   */
  it("keeps one person's key from reaching another person's order", async () => {
    const product = await makeProduct({ stock: { trackInventory: false } });
    const [alice, bob] = await Promise.all([createUserAndLogin(app), createUserAndLogin(app)]);
    const body = {
      items: [{ productId: String(product._id), quantity: 1 }],
      idempotencyKey: "same-key-for-both",
    };

    const aliceOrder = await place(body, alice.authHeader);
    const bobOrder = await place(body, bob.authHeader);

    expect(aliceOrder.status).toBe(201);
    expect(bobOrder.status).toBe(201);
    expect(bobOrder.body.data.order.id).not.toBe(aliceOrder.body.data.order.id);
    expect(await Order.countDocuments({})).toBe(2);
  });
});

describe("a customer's own orders", () => {
  it("returns only the caller's orders", async () => {
    const product = await makeProduct({ stock: { trackInventory: false } });
    const [mine, theirs] = await Promise.all([createUserAndLogin(app), createUserAndLogin(app)]);
    const items = [{ productId: String(product._id), quantity: 1 }];

    await place({ items }, mine.authHeader);
    const other = await place({ items }, theirs.authHeader);

    const response = await request(app)
      .post(`${API}/orders/filter`)
      .set("Authorization", mine.authHeader)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.orders).toHaveLength(1);
    expect(response.body.meta).toMatchObject({ page: 0, total: 1 });

    // And someone else's order is a 404, not a 403 - order ids are sequential.
    const detail = await request(app)
      .get(`${API}/orders/${other.body.data.order.id}`)
      .set("Authorization", mine.authHeader);

    expect(detail.status).toBe(404);
  });

  it("filters by status", async () => {
    const product = await makeProduct({ stock: { trackInventory: false } });
    const shopper = await createUserAndLogin(app);
    await place({ items: [{ productId: String(product._id), quantity: 1 }] }, shopper.authHeader);

    const pending = await request(app)
      .post(`${API}/orders/filter`)
      .set("Authorization", shopper.authHeader)
      .send({ status: "PENDING" });
    const delivered = await request(app)
      .post(`${API}/orders/filter`)
      .set("Authorization", shopper.authHeader)
      .send({ status: ["DELIVERED"] });

    expect(pending.body.data.orders).toHaveLength(1);
    expect(delivered.body.data.orders).toHaveLength(0);
  });

  it("requires a session", async () => {
    const response = await request(app).post(`${API}/orders/filter`).send({});

    expect(response.status).toBe(401);
  });

  it("hides staff-only fields from the customer view", async () => {
    const product = await makeProduct({ stock: { trackInventory: false } });
    const shopper = await createUserAndLogin(app);

    const response = await place(
      { items: [{ productId: String(product._id), quantity: 1 }] },
      shopper.authHeader
    );

    expect(response.body.data.order).not.toHaveProperty("client");
    expect(response.body.data.order).not.toHaveProperty("stockReleased");
    expect(response.body.data.order.items[0]).not.toHaveProperty("reservedQuantity");
  });
});

describe("guest checkout that creates an account", () => {
  it("requires an email when createAccount is set", async () => {
    const product = await makeProduct();

    const response = await place({
      items: [{ productId: String(product._id), quantity: 1 }],
      createAccount: true,
    });

    expect(response.status).toBe(422);
    expect(response.body.errors).toEqual([
      expect.objectContaining({ field: "body.email" }),
    ]);
  });

  it("places the order, then asks for a password rather than signing anyone in", async () => {
    const product = await makeProduct({ stock: { trackInventory: false } });
    const email = `checkout-${Date.now()}@test.dev`;

    const placed = await place({
      items: [{ productId: String(product._id), quantity: 2 }],
      createAccount: true,
      email,
    });

    expect(placed.status).toBe(201);
    expect(placed.body.data.accountInvite).toEqual({ status: "VERIFICATION_SENT", email });

    // The order stands on its own, with no account behind it yet.
    expect(placed.body.data.order.isGuestOrder).toBe(true);

    const invitation = lastMessageTo(email);
    expect(invitation.subject).toContain(placed.body.data.order.orderNumber);

    /* Step 2: the emailed link. Confirms the address and nothing else. */
    const token = verificationTokenFor(email);
    const verified = await request(app).post(`${API}/auth/verify-email`).send({ token });

    expect(verified.status).toBe(200);
    expect(verified.body.code).toBe("REQUIRED_PASSWORD");
    expect(verified.body.data.registrationToken).toBeTruthy();
    // No session: a link that arrived by email is not a login.
    expect(verified.body.data.accessToken).toBeUndefined();
    expect(verified.headers["set-cookie"]).toBeUndefined();

    /* Step 3: the password modal. */
    const completed = await request(app)
      .post(`${API}/auth/complete-registration`)
      .send({ token: verified.body.data.registrationToken, password: "Str0ngPass" });

    expect(completed.status).toBe(201);
    expect(completed.body.data.accessToken).toBeTruthy();
    expect(completed.body.data.user.email).toBe(email);

    /* The order that started all this is now theirs. */
    const orders = await request(app)
      .post(`${API}/orders/filter`)
      .set("Authorization", `Bearer ${completed.body.data.accessToken}`)
      .send({});

    expect(orders.body.data.orders).toHaveLength(1);
    expect(orders.body.data.orders[0].id).toBe(placed.body.data.order.id);
    expect(orders.body.data.orders[0].isGuestOrder).toBe(false);

    // And they can sign in with the password they chose, without verifying again.
    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email, password: "Str0ngPass" });

    expect(login.status).toBe(200);
  });

  /**
   * The ordering check that makes the two-step flow safe: without it, the
   * token from the verification email could be spent straight on creating an
   * account, skipping the verification it was issued to perform.
   */
  it("refuses the emailed token at the password step", async () => {
    const product = await makeProduct({ stock: { trackInventory: false } });
    const email = `direct-${Date.now()}@test.dev`;

    await place({
      items: [{ productId: String(product._id), quantity: 1 }],
      createAccount: true,
      email,
    });

    const emailedToken = verificationTokenFor(email);

    const response = await request(app)
      .post(`${API}/auth/complete-registration`)
      .send({ token: emailedToken, password: "Str0ngPass" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("does not invite someone who already has an account", async () => {
    const product = await makeProduct({ stock: { trackInventory: false } });
    const existing = await createUserAndLogin(app);

    const response = await place({
      items: [{ productId: String(product._id), quantity: 1 }],
      createAccount: true,
      email: existing.email,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.accountInvite.status).toBe("ACCOUNT_EXISTS");
  });

  it("ignores the flag for a caller who is already signed in", async () => {
    const product = await makeProduct({ stock: { trackInventory: false } });
    const shopper = await createUserAndLogin(app);

    const response = await place(
      {
        items: [{ productId: String(product._id), quantity: 1 }],
        createAccount: true,
        email: shopper.email,
      },
      shopper.authHeader
    );

    expect(response.status).toBe(201);
    expect(response.body.data.accountInvite).toBeNull();
  });
});
