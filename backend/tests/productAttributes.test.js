"use strict";

const request = require("supertest");
const createApp = require("../src/app");
const Attribute = require("../src/modules/attribute/attribute.model");
const Category = require("../src/modules/category/category.model");
const Brand = require("../src/modules/brand/brand.model");
const Product = require("../src/modules/product/product.model");
const productService = require("../src/modules/product/product.service");
const schemas = require("../src/modules/product/product.validation");
const { API } = require("./helpers");

const app = createApp();
const actor = { id: 1000, role: "ROLE_ADMIN" };

/**
 * Product attributes are an ordered list of titled groups:
 *
 *   [{ title: "General Info", options: { material: "cotton", fit: "regular" } }]
 *
 * Grouping is presentation - it decides how a spec table renders - but the
 * filters underneath address a bare key, so the two have to stay independent.
 * These tests exist to hold that line: which group a spec was filed under must
 * never change what a filter finds.
 */

async function fixture() {
  const [material, fit, care, color] = await Attribute.create([
    { name: "Material", key: "material", slug: "material", source: "product", type: "checkbox" },
    { name: "Fit", key: "fit", slug: "fit", source: "product", type: "checkbox" },
    { name: "Care", key: "wash", slug: "wash", source: "product", type: "checkbox" },
    { name: "Color", key: "color", slug: "color", source: "variant", type: "color" },
  ]);

  const category = await Category.create({
    name: "T-Shirts",
    slug: "t-shirts",
    status: "ACTIVE",
    visibility: "PUBLIC",
    attributes: [material._id, fit._id, care._id, color._id],
  });

  const brand = await Brand.create({ name: "Nike", slug: "nike", status: "ACTIVE" });

  return { category, brand };
}

const GROUPS = [
  { title: "General Info", options: { material: "cotton", fit: "regular" } },
  { title: "Care", options: { wash: "cold" } },
];

async function createProduct({ category, attributes = GROUPS, slug = "sports-t-shirt" }) {
  return productService.create(
    {
      name: "Sports T-Shirt",
      slug,
      description: "An attributes fixture",
      categoryIds: [String(category._id)],
      productType: "SIMPLE",
      sku: `SKU-${slug}`,
      status: "ACTIVE",
      visibility: "PUBLIC",
      attributes,
      sellingPrice: 1299,
      thumbnail: { alt: "Sports T-Shirt", src: "https://cdn.example.com/shirt.webp" },
    },
    actor
  );
}

describe("the grouped shape", () => {
  it("stores and returns groups in the order they were sent", async () => {
    const { category } = await fixture();

    const product = await createProduct({ category });

    expect(product.attributes).toEqual([
      { title: "General Info", options: { material: "cotton", fit: "regular" } },
      { title: "Care", options: { wash: "cold" } },
    ]);

    // Order is the display order of the spec table, so it must survive the
    // round trip rather than being alphabetised or re-keyed.
    expect(product.attributes.map((group) => group.title)).toEqual(["General Info", "Care"]);
  });

  it("keeps the groups intact through the storefront product page", async () => {
    const { category } = await fixture();
    await createProduct({ category });

    const response = await request(app).get(`${API}/shop/sports-t-shirt`);

    expect(response.status).toBe(200);
    expect(response.body.data.product.attributes).toEqual([
      { title: "General Info", options: { material: "cotton", fit: "regular" } },
      { title: "Care", options: { wash: "cold" } },
    ]);
  });

  it("accepts a product with no attributes at all", async () => {
    const { category } = await fixture();

    const product = await createProduct({ category, attributes: [] });

    expect(product.attributes).toEqual([]);
  });
});

describe("what the validator refuses", () => {
  const base = {
    name: "Sports T-Shirt",
    slug: "sports-t-shirt",
    description: "d",
    categoryIds: ["66bca1f8d7432e0012345678"],
    sellingPrice: 1299,
    thumbnail: { alt: "x", src: "https://cdn.example.com/shirt.webp" },
  };

  const parse = (attributes) => schemas.createProduct.body.safeParse({ ...base, attributes });

  /**
   * The rule the filters depend on. `attributes.options.<key>` matches if any
   * group carries the key, so the same key twice would make "which value"
   * ambiguous at query time - and the product would silently filter wrong
   * rather than fail.
   */
  it("rejects the same key in two groups", () => {
    const result = parse([
      { title: "General Info", options: { material: "cotton" } },
      { title: "Care", options: { material: "wool" } },
    ]);

    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(["attributes", 1, "options", "material"]);
    expect(result.error.issues[0].message).toContain("already set in group 0");
  });

  it("rejects two groups with the same title", () => {
    const result = parse([
      { title: "General Info", options: { material: "cotton" } },
      { title: "general info", options: { fit: "regular" } },
    ]);

    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(["attributes", 1, "title"]);
  });

  it("rejects a group with no title or no options", () => {
    expect(parse([{ title: "", options: { material: "cotton" } }]).success).toBe(false);
    expect(parse([{ options: { material: "cotton" } }]).success).toBe(false);
    expect(parse([{ title: "General Info", options: {} }]).success).toBe(false);
    expect(parse([{ title: "General Info" }]).success).toBe(false);
  });

  it("rejects unknown keys inside a group", () => {
    expect(
      parse([{ title: "General Info", options: { material: "cotton" }, extra: 1 }]).success
    ).toBe(false);
  });

  /**
   * A client still sending the old flat map must fail loudly rather than have
   * its specs silently dropped.
   */
  it("rejects the old flat-map shape", () => {
    const result = parse({ material: "cotton", fit: "regular" });

    expect(result.success).toBe(false);
  });

  it("caps the number of groups", () => {
    const many = Array.from({ length: 21 }, (_, index) => ({
      title: `Group ${index}`,
      options: { [`key_${index}`]: "value" },
    }));

    expect(parse(many).success).toBe(false);
  });
});

/**
 * Attribute keys are deliberately free-form: a product may carry a spec the
 * category has never heard of. The `Attribute` collection governs what is
 * *filterable*, not what is storable, so these two cases are stored verbatim
 * rather than rejected.
 */
describe("keys are not bound to the category configuration", () => {
  it("stores a key the category does not configure", async () => {
    const { category } = await fixture();

    const product = await createProduct({
      category,
      attributes: [
        { title: "General Info", options: { material: "cotton" } },
        { title: "Extras", options: { bogus: "x" } },
      ],
    });

    expect(product.attributes).toMatchObject([
      { title: "General Info", options: { material: "cotton" } },
      { title: "Extras", options: { bogus: "x" } },
    ]);
  });

  it("stores a variant-source attribute used as a product spec", async () => {
    const { category } = await fixture();

    const product = await createProduct({
      category,
      attributes: [{ title: "General Info", options: { color: "black" } }],
    });

    expect(product.attributes).toMatchObject([
      { title: "General Info", options: { color: "black" } },
    ]);
  });
});

describe("filtering reaches every group", () => {
  /**
   * The heart of the change. `wash` lives in the **second** group, and a
   * shopper filtering on it must still find the product - the group is a
   * display decision and the filter knows nothing about it.
   */
  it("finds a product by a key stored in a non-first group", async () => {
    const { category } = await fixture();
    await createProduct({ category });

    const first = await productService.list({
      categoryIds: [String(category._id)],
      filters: { material: ["cotton"] },
      sort: { field: "createdAt", direction: "desc" },
      pagination: { page: 0, limit: 20 },
    });

    const second = await productService.list({
      categoryIds: [String(category._id)],
      filters: { wash: ["cold"] },
      sort: { field: "createdAt", direction: "desc" },
      pagination: { page: 0, limit: 20 },
    });

    expect(first.total).toBe(1);
    expect(second.total).toBe(1);
    expect(second.items[0].slug).toBe("sports-t-shirt");
  });

  it("does not match a value the product does not have", async () => {
    const { category } = await fixture();
    await createProduct({ category });

    const result = await productService.list({
      categoryIds: [String(category._id)],
      filters: { material: ["wool"] },
      sort: { field: "createdAt", direction: "desc" },
      pagination: { page: 0, limit: 20 },
    });

    expect(result.total).toBe(0);
  });

  it("ANDs across groups", async () => {
    const { category } = await fixture();
    await createProduct({ category });

    const both = await productService.list({
      categoryIds: [String(category._id)],
      // material is in group 0, wash in group 1.
      filters: { material: ["cotton"], wash: ["cold"] },
      sort: { field: "createdAt", direction: "desc" },
      pagination: { page: 0, limit: 20 },
    });

    const mismatched = await productService.list({
      categoryIds: [String(category._id)],
      filters: { material: ["cotton"], wash: ["hot"] },
      sort: { field: "createdAt", direction: "desc" },
      pagination: { page: 0, limit: 20 },
    });

    expect(both.total).toBe(1);
    expect(mismatched.total).toBe(0);
  });

  it("filters the public storefront the same way", async () => {
    const { category } = await fixture();
    await createProduct({ category });

    const response = await request(app)
      .post(`${API}/shop`)
      .send({ categorySlugs: ["t-shirts"], filters: { wash: ["cold"] } });

    expect(response.status).toBe(200);
    expect(response.body.data.products).toHaveLength(1);

    const miss = await request(app)
      .post(`${API}/shop`)
      .send({ categorySlugs: ["t-shirts"], filters: { wash: ["hot"] } });

    expect(miss.body.data.products).toHaveLength(0);
  });
});

describe("facet counts read every group", () => {
  it("counts values from the first and later groups alike", async () => {
    const { category } = await fixture();
    await createProduct({ category, slug: "shirt-one" });
    await createProduct({
      category,
      slug: "shirt-two",
      attributes: [
        { title: "General Info", options: { material: "cotton", fit: "slim" } },
        { title: "Care", options: { wash: "warm" } },
      ],
    });

    const result = await productService.filters({ categoryId: String(category._id), filters: {} });
    const byKey = new Map(result.map((filter) => [filter.key, filter]));

    // Group 0.
    expect(byKey.get("material").options).toContainEqual(
      expect.objectContaining({ value: "cotton", count: 2 })
    );
    expect(byKey.get("fit").options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "regular", count: 1 }),
        expect.objectContaining({ value: "slim", count: 1 }),
      ])
    );

    // Group 1 - the case a flat-map pipeline would have missed entirely.
    expect(byKey.get("wash").options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "cold", count: 1 }),
        expect.objectContaining({ value: "warm", count: 1 }),
      ])
    );
  });

  it("counts a product once when an attribute holds a list of values", async () => {
    const { category } = await fixture();
    await createProduct({
      category,
      attributes: [{ title: "General Info", options: { material: ["cotton", "linen"] } }],
    });

    const result = await productService.filters({ categoryId: String(category._id), filters: {} });
    const material = result.find((filter) => filter.key === "material");

    expect(material.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "cotton", count: 1 }),
        expect.objectContaining({ value: "linen", count: 1 }),
      ])
    );
  });
});

describe("the section patch", () => {
  it("replaces the whole group list", async () => {
    const { category } = await fixture();
    const product = await createProduct({ category });

    const patched = await productService.patchSection(
      product.id,
      "attributes",
      {
        attributes: [
          { title: "Specification", options: { material: "linen", fit: "slim", wash: "warm" } },
        ],
      },
      actor
    );

    expect(patched.attributes).toEqual([
      { title: "Specification", options: { material: "linen", fit: "slim", wash: "warm" } },
    ]);

    // And the replacement is what the filters now see.
    const stored = await Product.findById(product.id).lean();
    expect(stored.attributes).toHaveLength(1);
  });

  it("leaves attributes alone when only tags are patched", async () => {
    const { category } = await fixture();
    const product = await createProduct({ category });

    const patched = await productService.patchSection(
      product.id,
      "attributes",
      { tags: ["sportswear"] },
      actor
    );

    expect(patched.tags).toEqual(["sportswear"]);
    expect(patched.attributes).toEqual(GROUPS);
  });
});
