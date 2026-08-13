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
const { API, createUserAndLogin } = require("./helpers");
const { ROLES } = require("../src/shared/constants");

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

  const parentCategory = await Category.create({
    name: "Clothing",
    slug: "clothing",
    status: "ACTIVE",
  });
  const category = await Category.create({
    name: "T-Shirts",
    slug: "t-shirts",
    parentId: parentCategory._id,
    status: "ACTIVE",
    attributes: [
      brandAttribute._id,
      colorAttribute._id,
      sizeAttribute._id,
      materialAttribute._id,
    ],
  });
  const brand = await Brand.create({ name: "Nike", slug: "nike", status: "ACTIVE" });
  return { category, parentCategory, brand };
}

describe("catalog", () => {
  it("rejects frontend-managed publication dates", () => {
    const product = {
      name: "Sports T-Shirt",
      slug: "sports-t-shirt",
      description: "A production catalog fixture",
      categoryIds: [new mongoose.Types.ObjectId().toString()],
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
    const { category, parentCategory, brand } = await catalogFixture();
    const product = await productService.create(
      {
        name: "Sports T-Shirt",
        slug: "sports-t-shirt",
        description: "A production catalog fixture",
        categoryIds: [String(category._id)],
        brandId: String(brand._id),
        productType: "VARIABLE",
        status: "ACTIVE",
        visibility: "PUBLIC",
        attributes: [{ title: "General Info", options: { material: "cotton" } }],
        variationOptions: { color: ["black", "white"], size: ["m", "l"] },
        sellingPrice: 1299, thumbnail: { alt: "Sports T-Shirt", src: "https://cdn.example.com/shirt.webp" },
      },
      actor
    );

    expect(product.id).toMatch(/^[a-f\d]{24}$/);
    expect(product).not.toHaveProperty("_id");
    expect(product.categoryIds[0]).toMatchObject({ id: String(category._id), name: "T-Shirts", slug: "t-shirts" });
    expect(product.categoryIds[0].path.map((item) => item.name)).toEqual(["Clothing", "T-Shirts"]);
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
    const { category, parentCategory, brand } = await catalogFixture();
    const product = await productService.create(
      {
        name: "Sports T-Shirt",
        slug: "sports-t-shirt",
        description: "A production catalog fixture",
        categoryIds: [String(category._id)],
        brandId: String(brand._id),
        productType: "VARIABLE",
        status: "ACTIVE",
        visibility: "PUBLIC",
        attributes: [{ title: "General Info", options: { material: "cotton" } }],
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
    const moderator = await createUserAndLogin(app, { role: ROLES.MODERATOR });
    const { category, parentCategory, brand } = await catalogFixture();
    await productService.create(
      {
        name: "Sports T-Shirt",
        slug: "sports-t-shirt",
        description: "Cotton shirt",
        categoryIds: [String(category._id)],
        brandId: String(brand._id),
        productType: "VARIABLE",
        status: "ACTIVE",
        visibility: "PUBLIC",
        attributes: [{ title: "General Info", options: { material: "cotton" } }],
        variationOptions: { color: ["black", "white"], size: ["m", "l"] },
        sellingPrice: 1299, thumbnail: { alt: "Sports T-Shirt", src: "https://cdn.example.com/shirt.webp" },
      },
      actor
    );
    const response = await request(app)
      .post(`${API}/products/filter`)
      .set("Authorization", moderator.authHeader)
      .send({
        categoryId: String(parentCategory._id),
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
        categoryIds: [String(category._id)],
        brandId: String(brand._id),
        productType: "VARIABLE",
        status: "ACTIVE",
        visibility: "PUBLIC",
        attributes: [{ title: "General Info", options: { material: "cotton" } }],
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
    const moderator = await createUserAndLogin(app, { role: ROLES.MODERATOR });
    const { category } = await catalogFixture();
    const response = await request(app)
      .post(`${API}/products/filter`)
      .set("Authorization", moderator.authHeader)
      .send({ categoryId: String(category._id), filters: { made_up_filter: ["x"] } });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("PRODUCT_FILTER_INVALID");
  });

  it("declares the indexes needed by catalog access patterns", () => {
    const productIndexes = Product.schema.indexes().map(([keys]) => keys);
    const variantIndexes = Variant.schema.indexes().map(([keys]) => keys);

    expect(productIndexes).toContainEqual({ categoryIds: 1, brandId: 1, status: 1, createdAt: -1 });
    expect(productIndexes).toContainEqual({ "attributes.$**": 1 });
    expect(variantIndexes).toContainEqual({ "options.$**": 1 });
    expect(variantIndexes).toContainEqual({ productId: 1, sellingPrice: 1 });
  });
});

describe("product section patches", () => {
  const schemas = require("../src/modules/product/product.validation");

  async function seedProduct(overrides = {}) {
    const { category, brand } = await catalogFixture();

    const product = await productService.create(
      {
        name: "Sports T-Shirt",
        slug: `patch-${Math.random().toString(36).slice(2, 10)}`,
        description: "A production catalog fixture",
        categoryIds: [String(category._id)],
        brandId: String(brand._id),
        productType: "VARIABLE",
        status: "ACTIVE",
        visibility: "PUBLIC",
        attributes: [{ title: "General Info", options: { material: "cotton" } }],
        variationOptions: { color: ["black"], size: ["m"] },
        sellingPrice: 1000,
        originalPrice: 1500,
        thumbnail: { alt: "Shirt", src: "https://cdn.example.com/shirt.webp" },
        ...overrides,
      },
      actor
    );

    return { product, category, brand };
  }

  it("updates only the fields of its own section", async () => {
    const { product } = await seedProduct();

    const patched = await productService.patchSection(
      product.id,
      "description",
      { shortDescription: "Just the summary" },
      actor
    );

    expect(patched.shortDescription).toBe("Just the summary");
    // The whole point: nothing outside the section moves.
    expect(patched.name).toBe(product.name);
    expect(patched.sellingPrice).toBe(product.sellingPrice);
    expect(patched.thumbnail.src).toBe(product.thumbnail.src);
  });

  it("checks price order against the stored value, not just the patch", async () => {
    // Stored: selling 1000, original 1500. Raising selling past 1500 must fail
    // even though the patch alone looks fine - this is the case a schema-only
    // check misses.
    const { product } = await seedProduct();

    await expect(
      productService.patchSection(product.id, "pricing", { sellingPrice: 2000 }, actor)
    ).rejects.toMatchObject({ code: "PRODUCT_PRICE_ORDER_INVALID" });

    // And the same in reverse: lowering originalPrice below the stored selling.
    await expect(
      productService.patchSection(product.id, "pricing", { originalPrice: 500 }, actor)
    ).rejects.toMatchObject({ code: "PRODUCT_PRICE_ORDER_INVALID" });
  });

  it("allows a price patch that stays consistent", async () => {
    const { product } = await seedProduct();

    const patched = await productService.patchSection(
      product.id,
      "pricing",
      { sellingPrice: 1200 },
      actor
    );

    expect(patched.sellingPrice).toBe(1200);
    expect(patched.originalPrice).toBe(1500);
  });

  it("lets originalPrice be cleared", async () => {
    const { product } = await seedProduct();

    const patched = await productService.patchSection(
      product.id,
      "pricing",
      { originalPrice: null },
      actor
    );

    expect(patched.originalPrice ?? null).toBeNull();
  });

  it("stamps publishedAt when general flips status to ACTIVE", async () => {
    const { product } = await seedProduct({ status: "DRAFT", visibility: "PUBLIC" });
    expect((await Product.findById(product.id).lean()).publishedAt).toBeNull();

    await productService.patchSection(product.id, "general", { status: "ACTIVE" }, actor);

    expect((await Product.findById(product.id).lean()).publishedAt).toBeInstanceOf(Date);
  });

  it("clears publishedAt when general returns a product to DRAFT", async () => {
    const { product } = await seedProduct();

    await productService.patchSection(product.id, "general", { status: "DRAFT" }, actor);

    expect((await Product.findById(product.id).lean()).publishedAt).toBeNull();
  });

  it("rejects an attribute the category does not configure", async () => {
    const { product } = await seedProduct();

    await expect(
      productService.patchSection(
        product.id,
        "attributes",
        { attributes: [{ title: "General Info", options: { bogus: "x" } }] },
        actor
      )
    ).rejects.toMatchObject({ code: "PRODUCT_ATTRIBUTE_INVALID" });
  });

  it("updates tags without disturbing attributes", async () => {
    const { product } = await seedProduct();

    const patched = await productService.patchSection(
      product.id,
      "attributes",
      { tags: ["sale", "summer"] },
      actor
    );

    expect(patched.tags).toEqual(["sale", "summer"]);
    expect(patched.attributes).toEqual([
      { title: "General Info", options: { material: "cotton" } },
    ]);
  });

  it("fills missing SEO fields from the merged product", async () => {
    const { product } = await seedProduct();

    const patched = await productService.patchSection(
      product.id,
      "seo",
      { seo: { title: "Custom SEO Title" } },
      actor
    );

    expect(patched.seo.title).toBe("Custom SEO Title");
    // Derived from the stored product, not from an empty patch.
    expect(patched.seo.ogImage).toBe("https://cdn.example.com/shirt.webp");
    expect(patched.seo.canonicalUrl).toContain(product.slug);
  });

  it("replaces media without touching anything else", async () => {
    const { product } = await seedProduct();

    const patched = await productService.patchSection(
      product.id,
      "media",
      { thumbnail: { alt: "New", src: "https://cdn.example.com/new.webp" } },
      actor
    );

    expect(patched.thumbnail.src).toBe("https://cdn.example.com/new.webp");
    expect(patched.name).toBe(product.name);
  });

  it("404s for a product that does not exist", async () => {
    await expect(
      productService.patchSection(
        new mongoose.Types.ObjectId().toString(),
        "description",
        { description: "x" },
        actor
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  describe("section schemas", () => {
    it("reject an empty patch", () => {
      for (const schema of [
        schemas.patchGeneral,
        schemas.patchDescription,
        schemas.patchPricing,
        schemas.patchAttributes,
        schemas.patchMedia,
      ]) {
        expect(() => schema.body.parse({})).toThrow();
      }
    });

    it("reject a field belonging to another section", () => {
      // `.strict()` means a mis-routed field is a clear 422 rather than a
      // silent no-op the UI would report as a successful save.
      expect(() => schemas.patchPricing.body.parse({ name: "Nope" })).toThrow();
      expect(() => schemas.patchDescription.body.parse({ sellingPrice: 10 })).toThrow();
      expect(() => schemas.patchMedia.body.parse({ seo: { title: "x" } })).toThrow();
    });

    it("refuse to change productType", () => {
      // Flipping VARIABLE/SIMPLE would orphan or strand the generated SKUs.
      expect(() => schemas.patchGeneral.body.parse({ productType: "SIMPLE" })).toThrow();
    });

    it("catch an inconsistent price when both values are sent together", () => {
      expect(() =>
        schemas.patchPricing.body.parse({ sellingPrice: 2000, originalPrice: 1000 })
      ).toThrow();
    });
  });
});

describe("public shop", () => {
  const shopSchemas = require("../src/modules/shop/shop.validation");
  const shopService = require("../src/modules/shop/shop.service");

  async function storefront() {
    const { category, brand } = await catalogFixture();

    const live = await productService.create(
      {
        name: "Live Tee", slug: "live-tee", description: "on sale",
        categoryIds: [String(category._id)], brandId: String(brand._id),
        productType: "VARIABLE", status: "ACTIVE", visibility: "PUBLIC",
        attributes: [{ title: "General Info", options: { material: "cotton" } }], variationOptions: { color: ["black"] },
        sellingPrice: 1000, originalPrice: 1500,
        thumbnail: { alt: "t", src: "https://cdn.example.com/a.webp" },
      },
      actor
    );

    const draft = await productService.create(
      {
        name: "Draft Tee", slug: "draft-tee", description: "not yet",
        categoryIds: [String(category._id)], brandId: String(brand._id),
        productType: "VARIABLE", status: "DRAFT", visibility: "PUBLIC",
        attributes: [{ title: "General Info", options: { material: "cotton" } }], variationOptions: { color: ["black"] },
        sellingPrice: 900,
        thumbnail: { alt: "d", src: "https://cdn.example.com/b.webp" },
      },
      actor
    );

    return { category, brand, live, draft };
  }

  const emptyQuery = () => shopSchemas.shopFilter.body.parse({});

  it("returns a lightweight card, not the full product", async () => {
    await storefront();

    const result = await shopService.list(emptyQuery());
    const [card] = result.items;

    expect(card).toMatchObject({ slug: "live-tee", inStock: expect.any(Boolean) });
    expect(card.discountPercent).toBe(33);
    // The weight a storefront grid does not need to carry.
    for (const heavy of ["description", "shortDescription", "attributes", "images", "seo", "tags"]) {
      expect(card).not.toHaveProperty(heavy);
    }
  });

  it("never exposes unpublished products", async () => {
    await storefront();

    const result = await shopService.list(emptyQuery());

    expect(result.items.map((item) => item.slug)).toEqual(["live-tee"]);
  });

  it("404s a draft slug rather than serving it as a preview", async () => {
    await storefront();

    await expect(shopService.getBySlug("draft-tee")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns full detail for a published slug", async () => {
    await storefront();

    const product = await shopService.getBySlug("live-tee");

    expect(product.description).toBe("on sale");
    expect(product.seo).toBeDefined();
  });

  it("unions several categories", async () => {
    const { category } = await storefront();
    const second = await require("../src/modules/category/category.model").create({
      name: "Hoodies", slug: "hoodies",
    });

    const result = await shopService.list(
      shopSchemas.shopFilter.body.parse({ categorySlugs: [category.slug, second.slug] })
    );

    // The live tee is in one of the two, so the union must still find it.
    expect(result.total).toBe(1);
  });

  it("serves filter options by category slug over GET", async () => {
    const { category } = await storefront();

    const options = await shopService.filterOptions(category.slug);

    expect(options).toBeDefined();
    await expect(shopService.filterOptions("no-such-category")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("resolves category and brand by slug", async () => {
    const { category, brand } = await storefront();

    const byCategory = await shopService.list(
      shopSchemas.shopFilter.body.parse({ categorySlugs: [category.slug] })
    );
    expect(byCategory.total).toBe(1);

    const byBrand = await shopService.list(
      shopSchemas.shopFilter.body.parse({ brandSlugs: [brand.slug] })
    );
    expect(byBrand.total).toBe(1);
  });

  it("404s an unknown slug instead of silently returning everything", async () => {
    await storefront();

    // Ignoring an unknown slug would widen the result set - the opposite of
    // what the shopper asked for.
    await expect(
      shopService.list(shopSchemas.shopFilter.body.parse({ categorySlugs: ["no-such-category"] }))
    ).rejects.toMatchObject({ statusCode: 404 });

    await expect(
      shopService.list(shopSchemas.shopFilter.body.parse({ brandSlugs: ["no-such-brand"] }))
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("applies static price and featured filters", async () => {
    await storefront();

    const tooExpensive = await shopService.list(
      shopSchemas.shopFilter.body.parse({ price: { min: 5000 } })
    );
    expect(tooExpensive.total).toBe(0);

    const inRange = await shopService.list(
      shopSchemas.shopFilter.body.parse({ price: { min: 500, max: 2000 } })
    );
    expect(inRange.total).toBe(1);

    const featured = await shopService.list(shopSchemas.shopFilter.body.parse({ featured: true }));
    expect(featured.total).toBe(0);
  });

  describe("query schema", () => {
    it("fills sort and pagination when omitted", () => {
      // `.default({})` returns the literal object without inner defaults,
      // which reached Mongo as `$skip: NaN`. `.prefault({})` parses it.
      const parsed = emptyQuery();

      expect(parsed.pagination).toEqual({ page: 0, limit: 24 });
      expect(parsed.sort).toEqual({ field: "createdAt", direction: "desc" });
    });

    it("requires a category before attribute filters", () => {
      expect(() => shopSchemas.shopFilter.body.parse({ filters: { color: ["black"] } })).toThrow();
    });

    it("accepts several category slugs", () => {
      const parsed = shopSchemas.shopFilter.body.parse({ categorySlugs: ["t-shirts", "hoodies"] });
      expect(parsed.categorySlugs).toEqual(["t-shirts", "hoodies"]);
    });

    it("rejects a malformed slug", () => {
      expect(() => shopSchemas.shopFilter.body.parse({ categorySlugs: ["Not A Slug"] })).toThrow();
      expect(() => shopSchemas.shopFilter.body.parse({ categorySlugs: [] })).toThrow();
    });

    it("rejects unknown keys", () => {
      expect(() => shopSchemas.shopFilter.body.parse({ nope: 1 })).toThrow();
    });
  });
});

describe("showInHome and storefront categories", () => {
  const Category = require("../src/modules/category/category.model");
  const categoryService = require("../src/modules/category/category.service");
  const shopSchemas = require("../src/modules/shop/shop.validation");
  const shopService = require("../src/modules/shop/shop.service");

  const query = (body = {}) => shopSchemas.shopCategories.body.parse(body);

  /** Parent > child, with the only product filed under the child. */
  async function tree() {
    const { category: child, brand } = await catalogFixture();

    const parent = await Category.create({
      name: "Menswear", slug: "menswear", status: "ACTIVE", visibility: "PUBLIC", showInHome: true,
      image: "https://cdn.example.com/categories/menswear.webp",
    });
    await Category.updateOne(
      { _id: child._id },
      {
        parentId: parent._id, showInHome: true, status: "ACTIVE", visibility: "PUBLIC",
        image: "https://cdn.example.com/categories/t-shirts.webp",
      }
    );

    const empty = await Category.create({
      name: "Empty", slug: "empty", status: "ACTIVE", visibility: "PUBLIC", showInHome: true,
    });

    await productService.create(
      {
        name: "Live Tee", slug: "home-tee", description: "d",
        categoryIds: [String(child._id)], brandId: String(brand._id),
        productType: "VARIABLE", status: "ACTIVE", visibility: "PUBLIC",
        attributes: [{ title: "General Info", options: { material: "cotton" } }], variationOptions: { color: ["black"] },
        sellingPrice: 1000,
        thumbnail: { alt: "t", src: "https://cdn.example.com/a.webp" },
      },
      actor
    );

    return { parent, child, empty };
  }

  it("defaults showInHome to false", async () => {
    const category = await Category.create({ name: "Plain", slug: "plain" });
    expect(category.showInHome).toBe(false);
  });

  it("hides categories that have nothing to sell", async () => {
    await tree();

    const result = await shopService.listCategories(query({ showInHome: true }));
    const slugs = result.items.map((item) => item.slug);

    // A tile leading to an empty grid is worse than one tile fewer.
    expect(slugs).not.toContain("empty");
  });

  it("counts the whole subtree, so a parent with stocked children appears", async () => {
    await tree();

    const slugs = (await shopService.listCategories(query({ showInHome: true }))).items.map((i) => i.slug);

    // The product sits on the child; clicking the parent tile would still
    // show it, so the parent must not be hidden.
    expect(slugs).toContain("menswear");
    expect(slugs).toContain("t-shirts");
  });

  it("includes empty categories when forceCategories is set", async () => {
    await tree();

    const slugs = (await shopService.listCategories(query({ forceCategories: true }))).items.map((i) => i.slug);

    expect(slugs).toContain("empty");
  });

  it("ignores the flag entirely when showInHome is omitted", async () => {
    const { child } = await tree();
    await Category.updateOne({ _id: child._id }, { showInHome: false });

    const slugs = (await shopService.listCategories(query({}))).items.map((i) => i.slug);

    // Not flagged, but it has products - so it is returned.
    expect(slugs).toContain("t-shirts");
  });

  it("filters to flagged categories when showInHome is true", async () => {
    const { child } = await tree();
    await Category.updateOne({ _id: child._id }, { showInHome: false });

    const slugs = (await shopService.listCategories(query({ showInHome: true }))).items.map((i) => i.slug);

    expect(slugs).not.toContain("t-shirts");
  });

  it("returns the minimal tile shape and paginates", async () => {
    await tree();

    const result = await shopService.listCategories(query({ pagination: { page: 0, limit: 1 } }));

    expect(result.items).toHaveLength(1);
    expect(result.page).toBe(0);
    // `image` is present because the fixture sets one; Mongoose omits unset
    // fields, so an image-less category simply has no key.
    expect(Object.keys(result.items[0]).sort()).toEqual(
      ["id", "image", "name", "parentId", "showInHome", "slug", "sortOrder"].sort()
    );
    // Weight a tile does not render.
    for (const heavy of ["description", "seo", "attributes", "status"]) {
      expect(result.items[0]).not.toHaveProperty(heavy);
    }
  });

  describe("bulk toggle", () => {
    it("sets the flag on several categories at once", async () => {
      const a = await Category.create({ name: "A", slug: "cat-a" });
      const b = await Category.create({ name: "B", slug: "cat-b" });

      const updated = await categoryService.setShowInHome(
        { ids: [String(a._id), String(b._id)], showInHome: true },
        actor
      );

      expect(updated).toHaveLength(2);
      expect(updated.every((category) => category.showInHome === true)).toBe(true);
    });

    it("is idempotent - it sets a state rather than flipping one", async () => {
      const a = await Category.create({ name: "A", slug: "cat-idem", showInHome: true });

      await categoryService.setShowInHome({ ids: [String(a._id)], showInHome: true }, actor);
      const twice = await categoryService.setShowInHome(
        { ids: [String(a._id)], showInHome: true },
        actor
      );

      // A retry after a dropped response must not invert what it just set.
      expect(twice[0].showInHome).toBe(true);
    });

    it("reports unknown ids rather than silently skipping them", async () => {
      const a = await Category.create({ name: "A", slug: "cat-known" });
      const missing = new mongoose.Types.ObjectId().toString();

      await expect(
        categoryService.setShowInHome({ ids: [String(a._id), missing], showInHome: true }, actor)
      ).rejects.toMatchObject({ code: "CATEGORY_NOT_FOUND" });

      // And nothing was applied.
      expect((await Category.findById(a._id)).showInHome).toBe(false);
    });

    it("rejects an empty or duplicated id list", () => {
      const schemas = require("../src/modules/category/category.validation");

      expect(() => schemas.toggleShowInHome.body.parse({ ids: [], showInHome: true })).toThrow();
      const dup = "6712f0c2a1b4d3e5f6a7b8c9";
      expect(() =>
        schemas.toggleShowInHome.body.parse({ ids: [dup, dup], showInHome: true })
      ).toThrow();
    });
  });
});
