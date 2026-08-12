"use strict";

const Attribute = require("../src/modules/attribute/attribute.model");
const attributeService = require("../src/modules/attribute/attribute.service");
const schemas = require("../src/modules/attribute/attribute.validation");

const actor = { id: 1000, role: "ROLE_ADMIN" };

describe("attribute contract", () => {
  it("does not accept configuration, validation or sortOrder", () => {
    const base = {
      name: "Color",
      key: "color",
      slug: "color",
      source: "variant",
      type: "color",
    };

    expect(() => schemas.createAttribute.body.parse({ ...base, configuration: {} })).toThrow();
    expect(() => schemas.createAttribute.body.parse({ ...base, validation: { required: true } })).toThrow();
    expect(() => schemas.createAttribute.body.parse({ ...base, sortOrder: 1 })).toThrow();
  });

  it("requires min and max for range attributes", async () => {
    const base = {
      name: "Screen Size",
      key: "screen_size",
      slug: "screen-size",
      source: "product",
      type: "range",
    };

    expect(() => schemas.createAttribute.body.parse(base)).toThrow();
    expect(() => schemas.createAttribute.body.parse({ ...base, min: 100, max: 10 })).toThrow();

    const parsed = schemas.createAttribute.body.parse({ ...base, min: 4, max: 100 });
    const attribute = await attributeService.create(parsed, actor);

    expect(attribute).toMatchObject({ min: 4, max: 100, type: "range" });
  });

  it("rejects min and max for non-range attributes", () => {
    expect(() =>
      schemas.createAttribute.body.parse({
        name: "Color",
        key: "color",
        slug: "color",
        source: "variant",
        type: "color",
        min: 0,
        max: 10,
      })
    ).toThrow();
  });

  it("lists attributes alphabetically without sortOrder", async () => {
    await Attribute.create([
      { name: "Size", key: "size", slug: "size", source: "variant", type: "checkbox" },
      { name: "Color", key: "color", slug: "color", source: "variant", type: "color" },
    ]);

    const result = await attributeService.list({ page: 0, limit: 20 });

    expect(result.items.map((attribute) => attribute.name)).toEqual(["Color", "Size"]);
    expect(result.items.every((attribute) => !("sortOrder" in attribute))).toBe(true);
  });
});
