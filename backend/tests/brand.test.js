"use strict";

const Brand = require("../src/modules/brand/brand.model");
const brandService = require("../src/modules/brand/brand.service");
const schemas = require("../src/modules/brand/brand.validation");

const actor = { id: 1000, role: "ROLE_ADMIN" };

describe("brand contract", () => {
  it("accepts and returns logo as a string", async () => {
    const input = schemas.createBrand.body.parse({
      name: "Nike",
      slug: "nike",
      description: "Global sportswear brand.",
      logo: "https://cdn.example.com/brands/nike.webp",
      website: "https://www.nike.com",
      status: "ACTIVE",
      visibility: "PUBLIC",
    });

    const brand = await brandService.create(input, actor);

    expect(brand.logo).toBe(input.logo);
    expect(brand).not.toHaveProperty("sortOrder");
  });

  it("rejects media objects and sortOrder", () => {
    const base = { name: "Nike", slug: "nike" };

    expect(() =>
      schemas.createBrand.body.parse({
        ...base,
        logo: { mediaId: 1050, altText: "Nike logo", type: "IMAGE", sortOrder: 0 },
      })
    ).toThrow();
    expect(() => schemas.createBrand.body.parse({ ...base, sortOrder: 10 })).toThrow();
  });

  it("lists brands alphabetically with stable id ordering", async () => {
    await Brand.create([
      { name: "Samsung", slug: "samsung", status: "ACTIVE", visibility: "PUBLIC" },
      { name: "Apple", slug: "apple", status: "ACTIVE", visibility: "PUBLIC" },
    ]);

    const result = await brandService.list({ pagination: { page: 0, limit: 20 } });

    expect(result.items.map((brand) => brand.name)).toEqual(["Apple", "Samsung"]);
  });
});
