"use strict";

const Attribute = require("../src/modules/attribute/attribute.model");
const Brand = require("../src/modules/brand/brand.model");
const Category = require("../src/modules/category/category.model");
const Product = require("../src/modules/product/product.model");
const Variant = require("../src/modules/product/variant.model");
const shopService = require("../src/modules/shop/shop.service");
const { PRODUCT_STATUS, PRODUCT_TYPE } = require("../src/shared/constants");
const { seedDatabase } = require("../scripts/seed");

const silentLogger = { info() {} };

function shopQuery(overrides = {}) {
  return {
    categorySlugs: ["neckbands"],
    filters: {},
    sort: { field: "createdAt", direction: "desc" },
    pagination: { page: 0, limit: 24 },
    ...overrides,
  };
}

describe("development seed", () => {
  it("creates a workable mobile catalog with filters, images, variants and stock states", async () => {
    const result = await seedDatabase(silentLogger);

    expect(result).toEqual(expect.objectContaining({
      brands: 10,
      categories: 10,
      products: 100,
    }));

    await expect(Brand.countDocuments()).resolves.toBe(10);
    await expect(Category.countDocuments()).resolves.toBe(10);
    await expect(Attribute.countDocuments()).resolves.toBeGreaterThan(10);
    await expect(Product.countDocuments({ productType: PRODUCT_TYPE.VARIABLE })).resolves.toBe(40);
    await expect(Product.countDocuments({ productType: PRODUCT_TYPE.SIMPLE })).resolves.toBe(60);
    await expect(Product.countDocuments({ status: PRODUCT_STATUS.OUT_OF_STOCK })).resolves.toBe(10);
    await expect(Variant.countDocuments()).resolves.toBeGreaterThan(100);
    await expect(Variant.countDocuments({ status: PRODUCT_STATUS.OUT_OF_STOCK })).resolves.toBeGreaterThan(0);

    const product = await Product.findOne({ slug: "oneplus-bullets-wireless-z2-neckband-neckbands" }).lean();
    expect(product.thumbnail.src).toMatch(/^https:\/\//);
    expect(product.thumbnail.src).not.toContain("placehold.co");
    expect(product.images).toHaveLength(2);
    expect(product.tags).toEqual(expect.arrayContaining(["neckbands", "similar-products"]));

    const blackNeckbands = await shopService.list(shopQuery({
      filters: { color: ["black"] },
      inStock: true,
    }));
    expect(blackNeckbands.total).toBeGreaterThan(0);
    expect(blackNeckbands.items[0].thumbnail.src).toMatch(/^https:\/\//);

    const outOfStockNeckbands = await shopService.list(shopQuery({ inStock: false }));
    expect(outOfStockNeckbands.total).toBeGreaterThan(0);

    const filters = await shopService.filterOptions("neckbands");
    const byKey = new Map(filters.map((filter) => [filter.key, filter]));
    expect(byKey.get("color").options.length).toBeGreaterThan(0);
    expect(byKey.get("battery_life").range).toEqual(expect.objectContaining({ min: expect.any(Number) }));
  });
});
