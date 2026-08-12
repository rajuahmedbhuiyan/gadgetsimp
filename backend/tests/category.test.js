"use strict";

const Attribute = require("../src/modules/attribute/attribute.model");
const Category = require("../src/modules/category/category.model");
const categoryService = require("../src/modules/category/category.service");
const schemas = require("../src/modules/category/category.validation");

const actor = { id: 1000, role: "ROLE_ADMIN" };

async function createAttribute(overrides = {}) {
  return Attribute.create({
    name: "Material",
    key: "material",
    slug: "material",
    source: "product",
    type: "checkbox",
    status: "ACTIVE",
    ...overrides,
  });
}

describe("category write contract", () => {
  it("accepts a string image, optional parentId and an array of attribute ids", async () => {
    const attribute = await createAttribute();
    const input = {
      name: "T-Shirts",
      slug: "t-shirts",
      description: "Performance, casual and everyday t-shirts.",
      status: "ACTIVE",
      visibility: "PUBLIC",
      image: "https://cdn.example.com/categories/t-shirts.webp",
      attributes: [String(attribute._id)],
      seo: {
        title: "Buy T-Shirts Online | GadgetSimp",
        description: "Shop performance and casual t-shirts online.",
        keywords: ["t-shirts", "mens t-shirts"],
        canonicalUrl: "https://gadgetsimp.dev/categories/t-shirts",
        noIndex: false,
        noFollow: false,
      },
      sortOrder: 20,
    };

    const parsed = schemas.createCategory.body.parse(input);
    const category = await categoryService.create(parsed, actor);

    expect(category).toMatchObject({
      name: "T-Shirts",
      parentId: null,
      image: input.image,
    });
    expect(category.attributes).toEqual([
      {
        id: String(attribute._id),
        name: "Material",
        key: "material",
        source: "product",
        type: "checkbox",
      },
    ]);
    expect(category).not.toHaveProperty("bannerImage");
    expect(category).not.toHaveProperty("publishedAt");
  });

  it("rejects media objects, bannerImage, publishedAt and attribute configuration objects", () => {
    const base = { name: "T-Shirts", slug: "t-shirts", attributes: [] };

    expect(() => schemas.createCategory.body.parse({ ...base, image: { mediaId: 1060 } })).toThrow();
    expect(() => schemas.createCategory.body.parse({ ...base, bannerImage: "banner.webp" })).toThrow();
    expect(() => schemas.createCategory.body.parse({ ...base, publishedAt: new Date().toISOString() })).toThrow();
    expect(() =>
      schemas.createCategory.body.parse({
        ...base,
        attributes: [{ attributeId: "66bca1f8d7432e0012345680" }],
      })
    ).toThrow();
  });

  it("rejects duplicate attribute ids", async () => {
    const attribute = await createAttribute();

    await expect(
      categoryService.create(
        {
          name: "T-Shirts",
          slug: "t-shirts",
          attributes: [String(attribute._id), String(attribute._id)],
        },
        actor
      )
    ).rejects.toMatchObject({ code: "CATEGORY_ATTRIBUTE_DUPLICATE", statusCode: 422 });
  });

  it("rejects missing, inactive and deleted Attribute Library references", async () => {
    const inactive = await createAttribute({
      name: "Inactive Material",
      key: "inactive_material",
      slug: "inactive-material",
      status: "INACTIVE",
    });

    for (const id of [String(inactive._id), String(new Category()._id)]) {
      await expect(
        categoryService.create(
          { name: "T-Shirts", slug: `t-shirts-${id.slice(-4)}`, attributes: [id] },
          actor
        )
      ).rejects.toMatchObject({ code: "CATEGORY_ATTRIBUTE_INVALID", statusCode: 422 });
    }
  });
});

describe("grouped category filtering", () => {
  it("returns an ordered parent/children tree", async () => {
    const men = await Category.create({ name: "Men", slug: "men", status: "ACTIVE", sortOrder: 0 });
    const clothing = await Category.create({
      name: "Clothing",
      slug: "clothing",
      parentId: men._id,
      status: "ACTIVE",
      sortOrder: 1,
    });
    await Category.create([
      { name: "T-Shirts", slug: "t-shirts", parentId: clothing._id, status: "ACTIVE", sortOrder: 1 },
      { name: "Shirts", slug: "shirts", parentId: clothing._id, status: "ACTIVE", sortOrder: 0 },
    ]);

    const tree = await categoryService.filterGrouped({});

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ id: String(men._id), name: "Men" });
    expect(tree[0].children[0]).toMatchObject({ id: String(clothing._id), name: "Clothing" });
    expect(tree[0].children[0].parentId).toEqual({
      id: String(men._id),
      name: "Men",
      slug: "men",
    });
    expect(tree[0].children[0].children.map((category) => category.name)).toEqual(["Shirts", "T-Shirts"]);
  });

  it("keeps ancestors when grouped results are searched", async () => {
    const men = await Category.create({ name: "Men", slug: "men", status: "ACTIVE" });
    const clothing = await Category.create({
      name: "Clothing",
      slug: "clothing",
      parentId: men._id,
      status: "ACTIVE",
    });
    await Category.create({
      name: "T-Shirts",
      slug: "t-shirts",
      parentId: clothing._id,
      status: "ACTIVE",
    });

    const tree = await categoryService.filterGrouped({ search: "t-shirts" });

    expect(tree[0].name).toBe("Men");
    expect(tree[0].children[0].name).toBe("Clothing");
    expect(tree[0].children[0].children[0].name).toBe("T-Shirts");
  });
});

describe("category sorting and parent changes", () => {
  it("changes only parentId and sortOrder while preserving all other fields", async () => {
    const parent = await Category.create({ name: "Clothing", slug: "clothing", status: "ACTIVE" });
    const category = await Category.create({
      name: "T-Shirts",
      slug: "t-shirts",
      description: "Original description",
      image: "category.webp",
      status: "ACTIVE",
      visibility: "PUBLIC",
      sortOrder: 9,
      seo: { title: "Original SEO" },
    });

    const result = await categoryService.sort(
      [{ id: String(category._id), parentId: String(parent._id), sortOrder: 2 }],
      actor
    );
    const stored = await Category.findById(category._id).lean();

    expect(result).toEqual([
      {
        id: String(category._id),
        parentId: { id: String(parent._id), name: "Clothing", slug: "clothing" },
        sortOrder: 2,
      },
    ]);
    expect(stored).toMatchObject({
      name: "T-Shirts",
      slug: "t-shirts",
      description: "Original description",
      image: "category.webp",
      status: "ACTIVE",
      visibility: "PUBLIC",
      sortOrder: 2,
      seo: { title: "Original SEO" },
    });
    expect(String(stored.parentId)).toBe(String(parent._id));
  });

  it("allows order-only updates by omitting parentId", async () => {
    const parent = await Category.create({ name: "Clothing", slug: "clothing", status: "ACTIVE" });
    const category = await Category.create({
      name: "T-Shirts",
      slug: "t-shirts",
      parentId: parent._id,
      status: "ACTIVE",
      sortOrder: 5,
    });

    await categoryService.sort([{ id: String(category._id), sortOrder: 0 }], actor);
    const stored = await Category.findById(category._id).lean();

    expect(String(stored.parentId)).toBe(String(parent._id));
    expect(stored.sortOrder).toBe(0);
  });

  it("rejects unknown parents and hierarchy cycles", async () => {
    const parent = await Category.create({ name: "Men", slug: "men", status: "ACTIVE" });
    const child = await Category.create({
      name: "Clothing",
      slug: "clothing",
      parentId: parent._id,
      status: "ACTIVE",
    });
    const missingId = String(new Category()._id);

    await expect(
      categoryService.sort(
        [{ id: String(child._id), parentId: missingId, sortOrder: 0 }],
        actor
      )
    ).rejects.toMatchObject({ code: "CATEGORY_PARENT_INVALID", statusCode: 422 });

    await expect(
      categoryService.sort(
        [{ id: String(parent._id), parentId: String(child._id), sortOrder: 0 }],
        actor
      )
    ).rejects.toMatchObject({ code: "CATEGORY_CYCLE", statusCode: 422 });
  });

  it("accepts only structural fields in the sort request", () => {
    const id = "66bca1f8d7432e0012345678";
    expect(() =>
      schemas.sortCategories.body.parse({
        categories: [{ id, parentId: null, sortOrder: 0, name: "Must not be accepted" }],
      })
    ).toThrow();
  });
});
