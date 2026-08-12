"use strict";

const request = require("supertest");
const mongoose = require("mongoose");
const createApp = require("../src/app");
const Attribute = require("../src/modules/attribute/attribute.model");
const Category = require("../src/modules/category/category.model");
const Brand = require("../src/modules/brand/brand.model");
const Product = require("../src/modules/product/product.model");
const Variant = require("../src/modules/product/variant.model");
const productService = require("../src/modules/product/product.service");
const variationService = require("../src/modules/variation/variation.service");
const { API } = require("./helpers");

const app = createApp();
const actor = { id: 1000, role: "ROLE_ADMIN" };

async function catalogFixture() {
  const [brandAttribute, colorAttribute, sizeAttribute, materialAttribute] = await Attribute.create([
    {
      name: "Brand",
      key: "brand",
      slug: "brand",
      source: "entity",
      type: "checkbox",
    },
    {
      name: "Color",
      key: "color",
      slug: "color",
      source: "variant",
      type: "color",
    },
    {
      name: "Size",
      key: "size",
      slug: "size",
      source: "variant",
      type: "checkbox",
    },
    {
      name: "Material",
      key: "material",
      slug: "material",
      source: "product",
      type: "checkbox",
    },
  ]);

  const category = await Category.create({
    name: "T-Shirts",
    slug: "t-shirts",
    status: "ACTIVE",
    attributes: [
      brandAttribute._id,
      colorAttribute._id,
      sizeAttribute._id,
      materialAttribute._id,
    ],
  });
  const brand = await Brand.create({ name: "Nike", slug: "nike", status: "ACTIVE" });
  return { category, brand };
}

describe("catalog", () => {
  it("rejects frontend-managed publication dates", () => {
    const product = {
      name: "Sports T-Shirt",
      slug: "sports-t-shirt",
      description: "A production catalog fixture",
      categoryId: new mongoose.Types.ObjectId().toString(),
      sku: "SPORTS-TSHIRT",
      sellingPrice: 1299,
      thumbnail: { alt: "Sports T-Shirt", src: "https://cdn.example.com/shirt.webp" },
      publishedAt: new Date().toISOString(),
    };
    const schemas = require("../src/modules/product/product.validation");
    expect(() => schemas.createProduct.body.parse(product)).toThrow();
    expect(() => schemas.updateProduct.body.parse(product)).toThrow();

    const validUpdate = { ...product };
    delete validUpdate.publishedAt;
    validUpdate.variationOptions = { color: ["black"], size: ["m"] };
    expect(schemas.updateProduct.body.parse(validUpdate).variationOptions).toEqual(validUpdate.variationOptions);
    expect(() => schemas.updateProduct.body.parse({ ...validUpdate, productType: "VARIABLE" })).toThrow();
    expect(() => schemas.updateProduct.body.parse({
      ...validUpdate,
      variations: [{ options: { color: "black", size: "m" } }],
    })).toThrow();
  });

  it("generates variations and returns minimal product relationships", async () => {
    const { category, brand } = await catalogFixture();
    const product = await productService.create(
      {
        name: "Sports T-Shirt",
        slug: "sports-t-shirt",
        description: "A production catalog fixture",
        categoryId: String(category._id),
        brandId: String(brand._id),
        productType: "VARIABLE",
        status: "ACTIVE",
        visibility: "PUBLIC",
        attributes: { material: "cotton" },
        variationOptions: { color: ["black", "white"], size: ["m", "l"] },
        sellingPrice: 1299, thumbnail: { alt: "Sports T-Shirt", src: "https://cdn.example.com/shirt.webp" },
      },
      actor
    );

    expect(product.id).toMatch(/^[a-f\d]{24}$/);
    expect(product).not.toHaveProperty("_id");
    expect(product.categoryId).toMatchObject({ id: String(category._id), name: "T-Shirts", slug: "t-shirts" });
    expect(product.brandId).toMatchObject({ id: String(brand._id), name: "Nike", slug: "nike" });
    expect(product.currency).toBe("BDT");
    expect(product.seo).toMatchObject({ title: "Sports T-Shirt", ogImage: "https://cdn.example.com/shirt.webp" });

    expect(product.variations).toHaveLength(4);
    expect(product.variations.every((variation) => variation.id && !variation._id)).toBe(true);
    expect(new Set(product.variations.map((variation) => variation.sku)).size).toBe(4);

    const preview = variationService.generate({
      options: { color: ["black", "white"], size: ["m", "l"] },
      sellingPrice: 1299,
      originalPrice: 1499,
      stock: { quantity: 8, trackInventory: true, allowBackorder: false, lowStockThreshold: 2, status: "IN_STOCK" },
      status: "ACTIVE",
      image: { alt: "Sports T-Shirt", src: "https://cdn.example.com/shirt.webp" },
    });
    expect(preview).toHaveLength(4);
    expect(preview[0]).toMatchObject({
      options: { color: "black", size: "m" },
      sellingPrice: 1299,
      originalPrice: 1499,
      stock: { quantity: 8, status: "IN_STOCK" },
      status: "ACTIVE",
      image: { alt: "Sports T-Shirt", src: "https://cdn.example.com/shirt.webp" },
      sortOrder: 0,
    });
    expect(await Variant.countDocuments({ productId: product.id })).toBe(4);
  });

  it("partially updates a variant and preserves omitted fields", async () => {
    const { category, brand } = await catalogFixture();
    const product = await productService.create(
      {
        name: "Sports T-Shirt",
        slug: "sports-t-shirt",
        description: "A production catalog fixture",
        categoryId: String(category._id),
        brandId: String(brand._id),
        productType: "VARIABLE",
        status: "ACTIVE",
        visibility: "PUBLIC",
        attributes: { material: "cotton" },
        variationOptions: { color: ["black"], size: ["m"] },
        sellingPrice: 1299, thumbnail: { alt: "Sports T-Shirt", src: "https://cdn.example.com/shirt.webp" },
      },
      actor
    );
    const [original] = product.variations;

    const updated = await variationService.patch(
      original.id,
      { stock: { quantity: 7 } },
      actor
    );

    expect(updated.sku).toBe(original.sku);
    expect(updated.options).toEqual(original.options);
    expect(updated.sellingPrice).toEqual(original.sellingPrice);
    expect(updated.stock).toMatchObject({
      quantity: 7,
      trackInventory: original.stock.trackInventory,
      allowBackorder: original.stock.allowBackorder,
      lowStockThreshold: original.stock.lowStockThreshold,
      status: original.stock.status,
    });

    const deleted = await variationService.remove(original.id, actor);
    expect(deleted).toEqual({ id: original.id });
    await expect(variationService.getById(original.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lists via POST with OR within filters and AND across filters", async () => {
    const { category, brand } = await catalogFixture();
    await productService.create(
      {
        name: "Sports T-Shirt",
        slug: "sports-t-shirt",
        description: "Cotton shirt",
        categoryId: String(category._id),
        brandId: String(brand._id),
        productType: "VARIABLE",
        status: "ACTIVE",
        visibility: "PUBLIC",
        attributes: { material: "cotton" },
        variationOptions: { color: ["black", "white"], size: ["m", "l"] },
        sellingPrice: 1299, thumbnail: { alt: "Sports T-Shirt", src: "https://cdn.example.com/shirt.webp" },
      },
      actor
    );
    const response = await request(app)
      .post(`${API}/products/filter`)
      .send({
        categoryId: String(category._id),
        filters: { brand: [String(brand._id)], color: ["black", "white"], size: ["m"] },
        sort: { field: "price", direction: "asc" },
        pagination: { page: 0, limit: 24 },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.products).toHaveLength(1);
    expect(response.body.data.products[0]).not.toHaveProperty("_id");
    expect(response.body.meta).toMatchObject({ page: 0, limit: 24, total: 1 });
  });

  it("builds metadata-driven filter options and database counts", async () => {
    const { category, brand } = await catalogFixture();
    await productService.create(
      {
        name: "Sports T-Shirt",
        slug: "sports-t-shirt",
        description: "Cotton shirt",
        categoryId: String(category._id),
        brandId: String(brand._id),
        productType: "VARIABLE",
        status: "ACTIVE",
        visibility: "PUBLIC",
        attributes: { material: "cotton" },
        variationOptions: { color: ["black", "white"], size: ["m", "l"] },
        sellingPrice: 1299, thumbnail: { alt: "Sports T-Shirt", src: "https://cdn.example.com/shirt.webp" },
      },
      actor
    );
    const response = await request(app)
      .post(`${API}/products/filter-options`)
      .send({ categoryId: String(category._id), filters: { color: ["black"] } });

    expect(response.status).toBe(200);
    const byKey = new Map(response.body.data.filters.map((filter) => [filter.key, filter]));
    expect(byKey.get("brand").options).toContainEqual({
      value: String(brand._id),
      label: "Nike",
      count: 1,
    });
    expect(byKey.get("color").options).toEqual(
      expect.arrayContaining([
        { value: "black", label: "Black", count: 1 },
        { value: "white", label: "White", count: 1 },
      ])
    );
    expect(byKey.get("material").options).toContainEqual({ value: "cotton", label: "Cotton", count: 1 });
  });

  it("rejects hardcoded or unconfigured filter keys at the edge of the service", async () => {
    const { category } = await catalogFixture();
    const response = await request(app)
      .post(`${API}/products/filter`)
      .send({ categoryId: String(category._id), filters: { made_up_filter: ["x"] } });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("PRODUCT_FILTER_INVALID");
  });

  it("declares the indexes needed by catalog access patterns", () => {
    const productIndexes = Product.schema.indexes().map(([keys]) => keys);
    const variantIndexes = Variant.schema.indexes().map(([keys]) => keys);

    expect(productIndexes).toContainEqual({ categoryId: 1, brandId: 1, status: 1, createdAt: -1 });
    expect(productIndexes).toContainEqual({ "attributes.$**": 1 });
    expect(variantIndexes).toContainEqual({ "options.$**": 1 });
    expect(variantIndexes).toContainEqual({ productId: 1, sellingPrice: 1 });
  });
});
