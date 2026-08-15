/**
 * Client-side mirrors of the API's product validation.
 *
 * Same rules, same messages where it matters, so a form catches what the
 * server would have rejected instead of round-tripping to find out. The server
 * remains the authority - anything here that drifts is a bug in this file, not
 * a second opinion the UI is entitled to.
 *
 * Kept per-panel, matching the `PATCH /products/:id/{section}` endpoints, so a
 * panel validates exactly the fields it saves.
 */

import { z } from "zod";

import {
  PRODUCT_STATUSES,
  PRODUCT_VISIBILITIES,
  STOCK_STATUSES,
} from "@/lib/api/admin/products";

/* -------------------------------- pieces --------------------------------- */

/** Lowercase, hyphen-separated. The API rejects anything else outright. */
export const slugSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(240)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Lowercase letters, numbers and single hyphens only",
  );

export const imageSchema = z.object({
  src: z.string().trim().min(1, "An image URL is required").max(1024),
  alt: z.string().trim().max(180).default(""),
});

/**
 * The attribute key format the API enforces, and which the storefront's filters
 * query by: `attributes.options.<key>`.
 */
export const attributeKeySchema = z
  .string()
  .trim()
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "Start with a letter; lowercase letters, numbers and underscores only",
  )
  .max(80);

/* --------------------------------- panels -------------------------------- */

export const generalSchema = z.object({
  name: z.string().trim().min(1, "Required").max(240),
  slug: slugSchema,
  sku: z.string().trim().max(120).optional(),
  categoryIds: z.array(z.string()).min(1, "Pick at least one category").max(20),
  brandId: z.string().optional(),
  status: z.enum(PRODUCT_STATUSES),
  visibility: z.enum(PRODUCT_VISIBILITIES),
  featured: z.boolean(),
});

export const descriptionSchema = z.object({
  description: z.string().trim().min(1, "Required").max(100_000),
  shortDescription: z.string().trim().max(600).optional(),
});

/**
 * `originalPrice` is the struck-through "was" price, so it may not be below
 * what the shopper actually pays. The API applies the same rule against the
 * stored value when only one side is sent.
 */
export const pricingSchema = z
  .object({
    sellingPrice: z.coerce
      .number({ message: "Enter a price" })
      .min(0, "Cannot be negative"),
    originalPrice: z.union([
      z.coerce.number().min(0, "Cannot be negative"),
      z.literal(""),
    ]),
  })
  .refine(
    (value) =>
      value.originalPrice === "" ||
      Number(value.originalPrice) === 0 ||
      Number(value.originalPrice) >= value.sellingPrice,
    {
      message: "The was-price cannot be below the selling price",
      path: ["originalPrice"],
    },
  );

export const stockSchema = z.object({
  trackInventory: z.boolean(),
  quantity: z.coerce.number().int().min(0, "Cannot be negative"),
  lowStockThreshold: z.coerce.number().int().min(0, "Cannot be negative"),
  allowBackorder: z.boolean(),
  status: z.enum(STOCK_STATUSES),
});

export const mediaSchema = z.object({
  thumbnail: imageSchema,
  images: z.array(imageSchema).max(100),
});

export const seoSchema = z.object({
  title: z.string().trim().max(70, "At most 70 characters").optional(),
  description: z.string().trim().max(320, "At most 320 characters").optional(),
  keywords: z.array(z.string().trim().min(1).max(80)).max(30),
  noIndex: z.boolean(),
  noFollow: z.boolean(),
});

/**
 * The spec table.
 *
 * Two uniqueness rules, both load-bearing rather than hygiene, and both copied
 * from the API: a key repeated across groups makes `attributes.options.<key>`
 * ambiguous at query time and the product filters wrong *silently*, and a
 * repeated title renders as a duplicated heading.
 */
export const attributesSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(80)).max(100),
  groups: z
    .array(
      z.object({
        title: z.string().trim().min(1, "A group needs a title").max(120),
        options: z
          .array(
            z.object({
              key: attributeKeySchema,
              value: z.string().trim().min(1, "Required").max(500),
            }),
          )
          .min(1, "A group needs at least one option"),
      }),
    )
    .max(20, "At most 20 groups"),
});

/* ------------------------------- whole form ------------------------------- */

/** Create sends everything at once; `POST /products` has no panels. */
export const createProductSchema = generalSchema
  .and(descriptionSchema)
  .and(pricingSchema)
  .and(mediaSchema);

export type GeneralValues = z.input<typeof generalSchema>;
export type GeneralData = z.output<typeof generalSchema>;
export type DescriptionValues = z.input<typeof descriptionSchema>;
export type PricingValues = z.input<typeof pricingSchema>;
export type PricingData = z.output<typeof pricingSchema>;
export type StockValues = z.input<typeof stockSchema>;
export type StockData = z.output<typeof stockSchema>;
export type MediaValues = z.input<typeof mediaSchema>;
export type MediaData = z.output<typeof mediaSchema>;
export type SeoValues = z.input<typeof seoSchema>;
export type AttributesValues = z.input<typeof attributesSchema>;
export type AttributesData = z.output<typeof attributesSchema>;

/* ------------------------------- conversions ------------------------------ */

/** `Wireless Earbuds Pro` -> `wireless-earbuds-pro`, for the slug field. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 240);
}

/**
 * The form holds attribute options as an ordered array of key/value rows,
 * because an object cannot be edited a row at a time without losing order.
 * The API wants a record per group, so they are folded back on save.
 */
export function groupsToApi(groups: AttributesData["groups"]) {
  return groups.map((group) => ({
    title: group.title,
    options: Object.fromEntries(
      group.options.map((option) => [option.key, option.value]),
    ),
  }));
}

export function groupsFromApi(
  groups: { title: string; options: Record<string, unknown> }[] | undefined,
): AttributesData["groups"] {
  return (groups ?? []).map((group) => ({
    title: group.title,
    options: Object.entries(group.options).map(([key, value]) => ({
      key,
      // A multi-value option round-trips as a comma-joined string; the API
      // accepts an array, and splitting on save preserves that.
      value: Array.isArray(value) ? value.join(", ") : String(value),
    })),
  }));
}
