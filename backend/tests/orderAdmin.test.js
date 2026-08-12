"use strict";

const request = require("supertest");
const mongoose = require("mongoose");
const createApp = require("../src/app");
const Category = require("../src/modules/category/category.model");
const Product = require("../src/modules/product/product.model");
const Order = require("../src/modules/order/order.model");
const { API, createUserAndLogin } = require("./helpers");
const { ROLES } = require("../src/shared/constants");

const app = createApp();

const CONTACT = { name: "Rahim Uddin", phone: "+8801712345678" };
const ADDRESS = { line1: "House 42, Road 3", area: "Dhanmondi", city: "Dhaka", postalCode: "1209" };

async function makeProduct(overrides = {}) {
  const category = await Category.findOne({ slug: "admin-order-fixtures" }).lean();

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

async function placeOrder(overrides = {}, token) {
  const product = overrides.product ?? (await makeProduct(overrides.productOptions));

  const call = request(app).post(`${API}/orders`);
  if (token) call.set("Authorization", token);

  const response = await call.send({
    contact: CONTACT,
    shippingAddress: ADDRESS,
    items: [{ productId: String(product._id), quantity: overrides.quantity ?? 2 }],
    ...overrides.body,
  });

  if (response.status !== 201) {
    throw new Error(`Fixture order failed: ${response.status} ${response.text}`);
  }

  return { order: response.body.data.order, product };
}

function admin(token) {
  return {
    filter: (body) =>
      request(app).post(`${API}/admin/orders/filter`).set("Authorization", token).send(body),
    get: (id) => request(app).get(`${API}/admin/orders/${id}`).set("Authorization", token),
    status: (id, body) =>
      request(app).patch(`${API}/admin/orders/${id}/status`).set("Authorization", token).send(body),
    update: (id, body) =>
      request(app).patch(`${API}/admin/orders/${id}`).set("Authorization", token).send(body),
    remove: (id) => request(app).delete(`${API}/admin/orders/${id}`).set("Authorization", token),
    purge: (id) =>
      request(app).delete(`${API}/admin/orders/${id}/permanent`).set("Authorization", token),
  };
}

async function stockOf(product) {
  return (await Product.findById(product._id).lean()).stock.quantity;
}

let moderator;
let adminUser;
let mod;
let sudo;

beforeEach(async () => {
  await Category.create({ name: "Admin Orders", slug: "admin-order-fixtures", status: "ACTIVE" });
  [moderator, adminUser] = await Promise.all([
    createUserAndLogin(app, { role: ROLES.MODERATOR }),
    createUserAndLogin(app, { role: ROLES.ADMIN }),
  ]);
  mod = admin(moderator.authHeader);
  sudo = admin(adminUser.authHeader);
});

describe("access", () => {
  it("is closed to customers and to anonymous callers", async () => {
    const { order } = await placeOrder();
    const customer = await createUserAndLogin(app);
    const asCustomer = admin(customer.authHeader);

    expect((await asCustomer.filter({})).status).toBe(403);
    expect((await asCustomer.get(order.id)).status).toBe(403);
    expect((await asCustomer.status(order.id, { status: "CONFIRMED" })).status).toBe(403);
    expect((await asCustomer.update(order.id, { note: "x" })).status).toBe(403);
    expect((await asCustomer.remove(order.id)).status).toBe(403);

    expect((await request(app).post(`${API}/admin/orders/filter`).send({})).status).toBe(401);
  });

  it("lets a moderator work the queue but not delete", async () => {
    const { order } = await placeOrder();

    expect((await mod.filter({})).status).toBe(200);
    expect((await mod.status(order.id, { status: "CONFIRMED" })).status).toBe(200);
    expect((await mod.remove(order.id)).status).toBe(403);
    expect((await mod.purge(order.id)).status).toBe(403);
  });
});

describe("the staff queue", () => {
  it("shows every order with the data a customer never sees", async () => {
    const shopper = await createUserAndLogin(app);
    await placeOrder({}, shopper.authHeader);
    await placeOrder();

    const response = await mod.filter({});

    expect(response.body.data.orders).toHaveLength(2);

    const [first] = response.body.data.orders;
    expect(first).toHaveProperty("client");
    expect(first).toHaveProperty("userId");
    expect(first).toHaveProperty("stockReleased");
    expect(first.items[0]).toHaveProperty("reservedQuantity");
    expect(first.contact).toMatchObject(CONTACT);
    expect(first.shippingAddress).toMatchObject(ADDRESS);
  });

  it("searches by order number, name, phone and email", async () => {
    const { order } = await placeOrder();

    for (const term of [order.orderNumber, "Rahim", "8801712345678"]) {
      const response = await mod.filter({ search: term });
      expect({ term, found: response.body.data.orders.length }).toEqual({ term, found: 1 });
    }

    expect((await mod.filter({ search: "nobody-by-this-name" })).body.data.orders).toHaveLength(0);
  });

  it("narrows to guest orders, one customer, status and totals", async () => {
    const shopper = await createUserAndLogin(app);
    await placeOrder({}, shopper.authHeader);
    await placeOrder();

    expect((await mod.filter({ guestOnly: true })).body.data.orders).toHaveLength(1);
    expect((await mod.filter({ userId: shopper.id })).body.data.orders).toHaveLength(1);
    expect((await mod.filter({ status: "PENDING" })).body.data.orders).toHaveLength(2);
    expect((await mod.filter({ status: "DELIVERED" })).body.data.orders).toHaveLength(0);
    expect((await mod.filter({ minTotal: 5000 })).body.data.orders).toHaveLength(0);
    expect((await mod.filter({ minTotal: 100, maxTotal: 9000 })).body.data.orders).toHaveLength(2);
  });

  it("paginates from page zero", async () => {
    await placeOrder();
    await placeOrder();
    await placeOrder();

    const response = await mod.filter({ pagination: { page: 0, limit: 2 } });

    expect(response.body.data.orders).toHaveLength(2);
    expect(response.body.meta).toMatchObject({
      page: 0,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPrevPage: false,
    });
  });
});

describe("status workflow", () => {
  it("moves an order forward and records who did it", async () => {
    const { order } = await placeOrder();

    const response = await mod.status(order.id, { status: "CONFIRMED" });

    expect(response.status).toBe(200);
    expect(response.body.data.order.status).toBe("CONFIRMED");

    const history = response.body.data.order.statusHistory;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ status: "PENDING" });
    expect(history[1]).toMatchObject({
      status: "CONFIRMED",
      note: null,
      changedBy: moderator.id,
    });
  });

  it("requires a note for a cancellation and for a return", async () => {
    const { order } = await placeOrder();

    const noNote = await mod.status(order.id, { status: "CANCELED" });

    expect(noNote.status).toBe(422);
    expect(noNote.body.code).toBe("ORDER_STATUS_NOTE_REQUIRED");
    expect(noNote.body.errors[0]).toMatchObject({ field: "note", code: "NOTE_REQUIRED" });

    // Blank space is not a reason either.
    expect((await mod.status(order.id, { status: "CANCELED", note: "   " })).status).toBe(422);

    const withNote = await mod.status(order.id, {
      status: "CANCELED",
      note: "Customer unreachable on three attempts",
    });

    expect(withNote.status).toBe(200);
    expect(withNote.body.data.order.statusHistory.at(-1)).toMatchObject({
      status: "CANCELED",
      note: "Customer unreachable on three attempts",
      changedBy: moderator.id,
    });
  });

  it("does not require a note for a positive status", async () => {
    const { order } = await placeOrder();

    await mod.status(order.id, { status: "CONFIRMED" });
    await mod.status(order.id, { status: "OUT_FOR_DELIVERY" });
    const delivered = await mod.status(order.id, { status: "DELIVERED" });

    expect(delivered.status).toBe(200);
    // Cash on delivery is settled when the courier hands it over.
    expect(delivered.body.data.order.paymentStatus).toBe("PAID");
  });

  it("refuses an illegal transition", async () => {
    const { order } = await placeOrder();

    // PENDING cannot jump straight to delivered.
    const skipped = await mod.status(order.id, { status: "DELIVERED" });
    expect(skipped.status).toBe(422);
    expect(skipped.body.code).toBe("ORDER_STATUS_TRANSITION_INVALID");

    // And nothing moves backwards.
    await mod.status(order.id, { status: "CONFIRMED" });
    expect((await mod.status(order.id, { status: "PENDING" })).status).toBe(422);
  });

  it("treats a cancelled order as final", async () => {
    const { order } = await placeOrder();
    await mod.status(order.id, { status: "CANCELED", note: "Duplicate order" });

    const revived = await mod.status(order.id, { status: "CONFIRMED" });

    expect(revived.status).toBe(422);
    expect(revived.body.message).toContain("final");
  });

  it("refuses a no-op", async () => {
    const { order } = await placeOrder();

    const response = await mod.status(order.id, { status: "PENDING" });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("ORDER_STATUS_UNCHANGED");
  });

  it("returns the reserved stock when an order is cancelled", async () => {
    const { order, product } = await placeOrder({ quantity: 3 });

    expect(await stockOf(product)).toBe(7);

    await mod.status(order.id, { status: "CANCELED", note: "Out of delivery area" });

    expect(await stockOf(product)).toBe(10);
  });

  it("returns the stock on a return, after delivery", async () => {
    const { order, product } = await placeOrder({ quantity: 4 });

    await mod.status(order.id, { status: "CONFIRMED" });
    await mod.status(order.id, { status: "OUT_FOR_DELIVERY" });
    await mod.status(order.id, { status: "DELIVERED" });

    expect(await stockOf(product)).toBe(6);

    await mod.status(order.id, { status: "RETURNED", note: "Wrong size" });

    expect(await stockOf(product)).toBe(10);
  });

  /**
   * Restocking twice would invent inventory that never existed, so the flag
   * has to hold even when a second releasing operation follows the first.
   */
  it("does not restock twice when a cancelled order is then deleted", async () => {
    const { order, product } = await placeOrder({ quantity: 3 });

    await mod.status(order.id, { status: "CANCELED", note: "Customer changed their mind" });
    expect(await stockOf(product)).toBe(10);

    await sudo.remove(order.id);

    expect(await stockOf(product)).toBe(10);
  });
});

describe("correcting the delivery details", () => {
  it("merges address fields instead of replacing the address", async () => {
    const { order } = await placeOrder();

    const response = await mod.update(order.id, {
      shippingAddress: { city: "Chattogram", postalCode: "4000" },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.order.shippingAddress).toMatchObject({
      // Changed...
      city: "Chattogram",
      postalCode: "4000",
      // ...and the rest survived rather than being wiped.
      line1: ADDRESS.line1,
      area: ADDRESS.area,
      country: "Bangladesh",
    });
  });

  it("updates the name, phone and note", async () => {
    const { order } = await placeOrder();

    const response = await mod.update(order.id, {
      contact: { name: "Karim Mia", phone: "+8801799999999" },
      note: "Leave with the security guard",
    });

    expect(response.body.data.order.contact).toEqual({
      name: "Karim Mia",
      phone: "+8801799999999",
    });
    expect(response.body.data.order.note).toBe("Leave with the security guard");
  });

  it("clears the note with null but leaves it alone when omitted", async () => {
    const { order } = await placeOrder({ body: { note: "Original instruction" } });

    const untouched = await mod.update(order.id, { contact: { name: "Karim Mia" } });
    expect(untouched.body.data.order.note).toBe("Original instruction");

    const cleared = await mod.update(order.id, { note: null });
    expect(cleared.body.data.order.note).toBeNull();
  });

  it("rejects an empty update", async () => {
    const { order } = await placeOrder();

    expect((await mod.update(order.id, {})).status).toBe(422);
  });

  it("cannot touch money or state", async () => {
    const { order } = await placeOrder();

    for (const injection of [{ total: 1 }, { status: "DELIVERED" }, { items: [] }]) {
      expect((await mod.update(order.id, injection)).status).toBe(422);
    }

    const stored = await Order.findById(order.id).lean();
    expect(stored.total).toBe(2000);
    expect(stored.status).toBe("PENDING");
  });

  it("refuses to rewrite the record of a finished order", async () => {
    const { order } = await placeOrder();

    await mod.status(order.id, { status: "CONFIRMED" });
    await mod.status(order.id, { status: "OUT_FOR_DELIVERY" });
    await mod.status(order.id, { status: "DELIVERED" });

    const response = await mod.update(order.id, { shippingAddress: { city: "Sylhet" } });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("ORDER_FINALISED");
  });
});

describe("deletion", () => {
  it("soft deletes, hiding the order but keeping the record and freeing the stock", async () => {
    const { order, product } = await placeOrder({ quantity: 3 });

    const response = await sudo.remove(order.id);

    expect(response.status).toBe(200);
    expect(response.body.data.order.deletedAt).toBeTruthy();

    // Gone from the queue by default, still there when asked for.
    expect((await mod.filter({})).body.data.orders).toHaveLength(0);
    expect((await mod.filter({ includeDeleted: true })).body.data.orders).toHaveLength(1);

    // The row survives - an order is a financial record.
    expect(await Order.countDocuments({ _id: order.id })).toBe(1);
    // And its units go back on sale.
    expect(await stockOf(product)).toBe(10);
  });

  it("hides a soft-deleted order from its customer", async () => {
    const shopper = await createUserAndLogin(app);
    const { order } = await placeOrder({}, shopper.authHeader);

    await sudo.remove(order.id);

    const mine = await request(app)
      .post(`${API}/orders/filter`)
      .set("Authorization", shopper.authHeader)
      .send({});

    expect(mine.body.data.orders).toHaveLength(0);
    expect(
      (await request(app).get(`${API}/orders/${order.id}`).set("Authorization", shopper.authHeader))
        .status
    ).toBe(404);
  });

  it("permanently deletes on the separate route only", async () => {
    const { order, product } = await placeOrder({ quantity: 2 });

    const response = await sudo.purge(order.id);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: order.id, orderNumber: order.orderNumber });
    expect(await Order.countDocuments({ _id: order.id })).toBe(0);
    // Stock still had to come back before the record went away.
    expect(await stockOf(product)).toBe(10);

    expect((await sudo.purge(order.id)).status).toBe(404);
  });
});
