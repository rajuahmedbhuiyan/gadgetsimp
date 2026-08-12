"use strict";

/**
 * Development seed: an admin, a customer, a small category tree and a handful
 * of products.
 *
 * Idempotent - it wipes the three collections it owns first, so running it
 * twice gives the same state rather than duplicate-key errors. It refuses to
 * run against NODE_ENV=production, because "seed the dev database" typed
 * against the wrong DATABASE_URL is how catalogs get deleted.
 *
 *   npm run seed
 */

const mongoose = require("mongoose");
const env = require("../src/config/env");
const logger = require("../src/config/logger");
const {
  connectDatabase,
  disconnectDatabase,
  ensureIndexes,
} = require("../src/config/database");
const User = require("../src/modules/user/user.model");
const Category = require("../src/modules/category/category.model");
const Product = require("../src/modules/product/product.model");
const PendingRegistration = require("../src/modules/auth/pendingRegistration.model");
const { Counter } = require("../src/shared/sequence");
const categoryService = require("../src/modules/category/category.service");
const { ROLES, PRODUCT_STATUS } = require("../src/shared/constants");

// Prices are minor units: 16999900 poisha = 169,999.00 BDT.
const taka = (amount) => amount * 100;

async function seed() {
  if (env.isProduction) {
    throw new Error("Refusing to seed a production database");
  }

  await connectDatabase();

  // The seed relies on the unique indexes to catch duplicate slugs and
  // emails, so build them before writing anything.
  await ensureIndexes();

  logger.info("Clearing users, categories, products and pending signups");
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    PendingRegistration.deleteMany({}),
    // Reset the id sequence too, so a re-seed always produces the same ids
    // (1000, 1001, ...) and fixtures referencing them stay valid.
    Counter.deleteMany({}),
  ]);

  // Seeded accounts skip the email-verification flow deliberately - they are
  // created already verified so the API is usable without an inbox.
  const owner = await User.create({
    firstName: "Site",
    lastName: "Owner",
    email: "owner@gadgetsimp.dev",
    password: "Owner1234",
    role: ROLES.OWNER,
    emailVerifiedAt: new Date(),
  });

  const admin = await User.create({
    firstName: "Store",
    lastName: "Admin",
    email: "admin@gadgetsimp.dev",
    password: "Admin1234",
    role: ROLES.ADMIN,
    emailVerifiedAt: new Date(),
  });

  await User.create({
    firstName: "Mina",
    lastName: "Rahman",
    email: "moderator@gadgetsimp.dev",
    password: "Moderator1234",
    role: ROLES.MODERATOR,
    emailVerifiedAt: new Date(),
  });

  await User.create({
    firstName: "Raju",
    lastName: "Ahmed",
    email: "customer@gadgetsimp.dev",
    password: "Customer1234",
    role: ROLES.CUSTOMER,
    phone: "+8801712345678",
    emailVerifiedAt: new Date(),
  });

  // Built through the service so paths and depths are computed exactly as
  // they are at runtime, rather than hand-written and liable to drift.
  const electronics = await categoryService.create({
    name: "Electronics",
    description: "Phones, laptops and everything powered",
    displayOrder: 1,
  });

  const laptops = await categoryService.create({
    name: "Laptops",
    parent: electronics.id,
    displayOrder: 1,
  });

  const phones = await categoryService.create({
    name: "Phones",
    parent: electronics.id,
    displayOrder: 2,
  });

  const gaming = await categoryService.create({
    name: "Gaming Laptops",
    parent: laptops.id,
    displayOrder: 1,
  });

  const accessories = await categoryService.create({
    name: "Accessories",
    description: "Cables, cases and chargers",
    displayOrder: 2,
  });

  const products = [
    {
      title: "MacBook Air M3 13-inch",
      summary: "Fanless, 18-hour battery, M3 silicon.",
      description: "The thin-and-light that still handles Xcode builds.",
      brand: "Apple",
      category: laptops.id,
      price: taka(169999),
      compareAtPrice: taka(189999),
      stock: 24,
      sku: "MBA-M3-13",
      tags: ["ultrabook", "apple", "m3"],
      status: PRODUCT_STATUS.ACTIVE,
      isFeatured: true,
      images: [{ url: "https://cdn.gadgetsimp.dev/mba-m3.jpg", alt: "MacBook Air M3" }],
      variants: [
        {
          sku: "MBA-M3-256-MID",
          attributes: { Colour: "Midnight", Storage: "256GB" },
          price: taka(169999),
          stock: 12,
          isActive: true,
        },
        {
          sku: "MBA-M3-512-SLV",
          attributes: { Colour: "Silver", Storage: "512GB" },
          price: taka(199999),
          stock: 12,
          isActive: true,
        },
      ],
    },
    {
      title: "ASUS ROG Strix G16",
      summary: "RTX 4070, 240Hz panel.",
      brand: "ASUS",
      category: gaming.id,
      price: taka(214999),
      stock: 8,
      sku: "ROG-G16-4070",
      tags: ["gaming", "rtx", "nvidia"],
      status: PRODUCT_STATUS.ACTIVE,
      isFeatured: true,
    },
    {
      title: "Samsung Galaxy S24 Ultra",
      summary: "200MP camera, titanium frame.",
      brand: "Samsung",
      category: phones.id,
      price: taka(159999),
      compareAtPrice: taka(174999),
      stock: 30,
      sku: "SGS24U",
      tags: ["android", "flagship", "samsung"],
      status: PRODUCT_STATUS.ACTIVE,
    },
    {
      title: "Anker 737 Power Bank",
      summary: "24,000mAh, 140W output.",
      brand: "Anker",
      category: accessories.id,
      price: taka(14999),
      stock: 120,
      sku: "ANK-737",
      tags: ["charging", "usb-c"],
      status: PRODUCT_STATUS.ACTIVE,
    },
    {
      title: "Unreleased Pixel Fold 2",
      summary: "Embargoed until launch.",
      brand: "Google",
      category: phones.id,
      price: taka(219999),
      stock: 0,
      sku: "PXL-FOLD2",
      // Left as a draft on purpose: it should never appear in a public
      // listing, which makes it the fixture that proves the visibility rule.
      status: PRODUCT_STATUS.DRAFT,
    },
  ];

  for (const product of products) {
    const category = await Category.findById(product.category).select("path").lean();
    await Product.create({ ...product, categoryPath: category.path, createdBy: admin._id });
  }

  logger.info(
    { users: 4, categories: 5, products: products.length },
    "Seed complete"
  );
  logger.info(`Owner     : owner@gadgetsimp.dev / Owner1234 (id ${owner.id})`);
  logger.info(`Admin     : admin@gadgetsimp.dev / Admin1234 (id ${admin.id})`);
  logger.info("Moderator : moderator@gadgetsimp.dev / Moderator1234");
  logger.info("Customer  : customer@gadgetsimp.dev / Customer1234");
}

seed()
  .then(async () => {
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.fatal({ err: error }, "Seed failed");
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
  });
