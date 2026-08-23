/**
 * The product form's state, its tabs, and how each tab is judged valid.
 *
 * One flat state object rather than a form library. The screen has variant
 * matrices, sortable image rows and a rich-text editor in it - none of which
 * are `register()`-shaped - and a resolver over the whole thing would report
 * an error on the Variants tab while you are looking at Basics. Validation is
 * therefore per tab, which is also the unit the edit screen saves in.
 *
 * Every rule here mirrors one the API enforces. The server is still the
 * authority; this exists so a tab can refuse to call it, which is what the
 * brief asked for.
 */

import type {
  AdminImage,
  AdminProduct,
  AttributeGroup,
  ProductStatus,
  ProductVisibility,
  ProductWritePayload,
} from "@/lib/api/admin/products";
import { siteConfig } from "@/lib/config/site";
import type { OptionAxis, VariantRow } from "@/components/panel/products/variations-builder";
import { signatureOf } from "@/components/panel/products/variations-builder";

/** Where the storefront lives, for deriving a canonical URL. */
const SITE_URL = siteConfig.url.replace(/\/$/, "");

/* --------------------------------- state ---------------------------------- */

export interface SpecOption {
  key: string;
  value: string;
}

export interface SpecGroup {
  title: string;
  options: SpecOption[];
}

export interface ParsedSpecsResult {
  groups: SpecGroup[];
  skipped: number;
}

export interface ProductFormState {
  // Basics
  name: string;
  slug: string;
  sku: string;
  /** One leaf category. Its ancestors are added back on save. */
  categoryId: string;
  brandId: string;
  tags: string[];
  status: ProductStatus;
  visibility: ProductVisibility;
  featured: boolean;

  // Description
  description: string;
  shortDescription: string;

  // Pricing and stock
  sellingPrice: string;
  originalPrice: string;
  trackInventory: boolean;
  quantity: string;
  lowStockThreshold: string;
  allowBackorder: boolean;
  stockStatus: "IN_STOCK" | "OUT_OF_STOCK" | "BACKORDER";

  // Shipping
  requiresShipping: boolean;
  freeShipping: boolean;
  weightValue: string;
  weightUnit: "g" | "kg" | "oz" | "lb";
  length: string;
  width: string;
  height: string;
  dimensionUnit: "mm" | "cm" | "m" | "in";

  // Variants
  productType: "SIMPLE" | "VARIABLE";
  axes: OptionAxis[];
  variants: VariantRow[];

  /*
   * Two fields, not one list. The thumbnail is what the shop grid shows and is
   * required; the gallery is the product page and is not. Merging them made
   * "which one is the thumbnail" a matter of row order, which is invisible
   * until you notice the wrong picture on a card.
   */
  thumbnail: AdminImage | null;
  images: AdminImage[];

  // Specs
  specs: SpecGroup[];

  // SEO
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  canonicalUrl: string;
  noIndex: boolean;
  noFollow: boolean;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
}

export const emptyProductForm = (): ProductFormState => ({
  name: "",
  slug: "",
  sku: "",
  categoryId: "",
  brandId: "",
  tags: [],
  // Active and public by default: the products list shows published records
  // only, so a new draft would vanish the moment it is saved.
  status: "ACTIVE",
  visibility: "PUBLIC",
  featured: false,

  description: "",
  shortDescription: "",

  sellingPrice: "",
  originalPrice: "",
  trackInventory: true,
  quantity: "50",
  lowStockThreshold: "5",
  allowBackorder: false,
  stockStatus: "IN_STOCK",

  requiresShipping: true,
  freeShipping: false,
  weightValue: "",
  weightUnit: "kg",
  length: "",
  width: "",
  height: "",
  dimensionUnit: "cm",

  productType: "SIMPLE",
  axes: [],
  variants: [],

  thumbnail: null,
  images: [],

  specs: [],

  seoTitle: "",
  seoDescription: "",
  seoKeywords: [],
  canonicalUrl: "",
  noIndex: false,
  noFollow: false,
  ogTitle: "",
  ogDescription: "",
  ogImage: "",
  twitterTitle: "",
  twitterDescription: "",
  twitterImage: "",
});

/** Load an existing record into the form. */
export function formFromProduct(product: AdminProduct): ProductFormState {
  const base = emptyProductForm();

  const axes: OptionAxis[] = Object.entries(product.variationOptions ?? {}).map(
    ([key, values]) => ({ key, values }),
  );

  return {
    ...base,
    name: product.name,
    slug: product.slug,
    sku: product.sku ?? "",
    /*
     * A saved product carries the whole chain - leaf plus ancestors - and the
     * API returns them in no guaranteed order. The leaf is whichever of them
     * is not a parent of another in the list, resolved against the tree by the
     * caller; falling back to the last entry keeps the field populated when
     * the tree has not loaded yet.
     */
    categoryId: product.categoryIds.at(-1)?.id ?? "",
    brandId: product.brandId?.id ?? "",
    tags: product.tags ?? [],
    status: product.status,
    visibility: product.visibility,
    featured: product.featured,

    description: product.description ?? "",
    shortDescription: product.shortDescription ?? "",

    sellingPrice: product.sellingPrice != null ? String(product.sellingPrice) : "",
    originalPrice: product.originalPrice != null ? String(product.originalPrice) : "",
    trackInventory: product.stock?.trackInventory ?? true,
    quantity: String(product.stock?.quantity ?? 0),
    lowStockThreshold: String(product.stock?.lowStockThreshold ?? 0),
    allowBackorder: product.stock?.allowBackorder ?? false,
    stockStatus: product.stock?.status ?? "IN_STOCK",

    requiresShipping: product.shipping?.requiresShipping ?? true,
    freeShipping: product.shipping?.freeShipping ?? false,
    weightValue: product.shipping?.weight ? String(product.shipping.weight.value) : "",
    weightUnit: (product.shipping?.weight?.unit as ProductFormState["weightUnit"]) ?? "kg",
    length: product.shipping?.dimensions ? String(product.shipping.dimensions.length) : "",
    width: product.shipping?.dimensions ? String(product.shipping.dimensions.width) : "",
    height: product.shipping?.dimensions ? String(product.shipping.dimensions.height) : "",
    dimensionUnit: (product.shipping?.dimensions?.unit as ProductFormState["dimensionUnit"]) ?? "cm",

    productType: product.productType,
    axes,
    variants: [],

    thumbnail: product.thumbnail?.src ? product.thumbnail : null,
    images: product.images ?? [],

    specs: (product.attributes ?? []).map((group) => ({
      title: group.title,
      options: Object.entries(group.options).map(([key, value]) => ({
        key,
        value: Array.isArray(value) ? value.join(", ") : String(value),
      })),
    })),

    seoTitle: product.seo?.title ?? "",
    seoDescription: product.seo?.description ?? "",
    seoKeywords: product.seo?.keywords ?? [],
    canonicalUrl: product.seo?.canonicalUrl ?? "",
    noIndex: product.seo?.noIndex ?? false,
    noFollow: product.seo?.noFollow ?? false,
    ogTitle: product.seo?.ogTitle ?? "",
    ogDescription: product.seo?.ogDescription ?? "",
    ogImage: product.seo?.ogImage ?? "",
    twitterTitle: product.seo?.twitterTitle ?? "",
    twitterDescription: product.seo?.twitterDescription ?? "",
    twitterImage: product.seo?.twitterImage ?? "",
  };
}

/* ------------------------------ input formats ----------------------------- */

/**
 * Keep a money field numeric as it is typed.
 *
 * Letters and stray symbols are simply not accepted rather than accepted and
 * then rejected on save - there is no sensible price containing a `k`, and a
 * field that refuses the keystroke says so faster than a message underneath
 * it can. One decimal point survives; the second is dropped.
 */
export function numericOnly(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${whole}.${rest.join("").replace(/\./g, "")}` : cleaned;
}

/** Whole numbers only - quantities cannot be fractional. */
export function integerOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function parsePastedSpecs(
  raw: string,
  usedKeys: Iterable<string> = [],
): ParsedSpecsResult {
  const taken = new Set(
    Array.from(usedKeys, (key) => key.trim()).filter(Boolean),
  );
  const groups: SpecGroup[] = [];
  let current: SpecGroup | null = null;
  let pendingKey: string | null = null;
  let skipped = 0;

  const ensureGroup = () => {
    current ??= { title: "General Info", options: [] };
    if (!groups.includes(current)) groups.push(current);
    return current;
  };

  const addOption = (label: string, value: string) => {
    const key = uniqueSpecKey(specKeyFromLabel(label), taken);
    ensureGroup().options.push({ key, value: cleanSpecText(value) });
  };

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = cleanSpecText(rawLine);
    if (!line) continue;

    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      if (pendingKey) {
        skipped += 1;
        pendingKey = null;
      }
      current = { title: cleanSpecText(heading[1]), options: [] };
      groups.push(current);
      continue;
    }

    const colon = line.match(/^([^:]{2,80}):\s*(.+)$/);
    if (colon) {
      if (pendingKey) {
        skipped += 1;
        pendingKey = null;
      }
      addOption(colon[1], colon[2]);
      continue;
    }

    if (pendingKey) {
      addOption(pendingKey, line);
      pendingKey = null;
    } else {
      pendingKey = line;
    }
  }

  if (pendingKey) skipped += 1;

  return {
    groups: groups.filter((group) => group.title.trim() && group.options.length > 0),
    skipped,
  };
}

function cleanSpecText(value: string): string {
  return value
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .trim();
}

function specKeyFromLabel(label: string): string {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (!key) return "attribute";
  return /^[a-z]/.test(key) ? key : `attribute_${key}`;
}

function uniqueSpecKey(base: string, taken: Set<string>): string {
  let key = base;
  let index = 2;

  while (taken.has(key)) {
    key = `${base}_${index}`;
    index += 1;
  }

  taken.add(key);
  return key;
}

/**
 * Shape a slug as it is typed.
 *
 * The API's rule is `^[a-z0-9]+(?:-[a-z0-9]+)*$`, so a space or a capital is
 * not a warning to fix later - it is a 422. Correcting the keystroke means the
 * field can only ever hold a legal slug, and "Nike Sports T-Shirt" becomes
 * `nike-sports-t-shirt` without anyone thinking about it.
 *
 * A single trailing hyphen survives, because it is what a half-typed
 * `nike-` looks like a moment before the next word. A leading one does not:
 * nothing legal starts with it.
 */
export function normaliseSlug(
  raw: string,
  { final = false }: { final?: boolean } = {},
): string {
  const cleaned = raw
    .toLowerCase()
    // A run of anything illegal - spaces, punctuation, accents - collapses to
    // one hyphen rather than one per character.
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-/, "")
    .slice(0, 240);

  /*
   * `final` trims the trailing hyphen too, and is used when the slug is
   * *derived* rather than typed - from the product name, where "T-Shirt!"
   * would otherwise leave `t-shirt-` sitting there invalid. While someone is
   * typing their own slug the trailing hyphen has to survive, because it is
   * what `nike-` looks like a keystroke before `nike-sports`.
   */
  return final ? cleaned.replace(/-+$/, "") : cleaned;
}

/**
 * Shape a SKU as it is typed.
 *
 * The API only asks for a non-empty string, so this is a house rule rather
 * than a validation one: the conventional stock-keeping format is uppercase
 * alphanumeric split by hyphens, and letting one product be `nike sports` and
 * the next `NIKE-SPORTS` makes them harder to scan and to search.
 */
export function normaliseSku(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-/, "")
    .slice(0, 120);
}

/**
 * The API's own SKU token rule, mirrored.
 *
 * `product.service.js` builds a variant SKU as `skuToken(product.sku ?? slug)`
 * followed by each option value through the same function. Copying it here
 * means the SKU shown in the form is the one the server would have generated,
 * rather than a lookalike that differs on the first product with a slash in
 * its name.
 */
export function skuToken(value: string): string {
  return String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

/** `NIKE-SPORTS` + `{color: black, size: m}` -> `NIKE-SPORTS-BLACK-M`. */
export function deriveVariantSku(
  base: string,
  options: Record<string, string>,
): string {
  const root = skuToken(base);
  if (!root) return "";

  const parts = Object.values(options).map(skuToken).filter(Boolean);
  return [root, ...parts].join("-");
}

/* ---------------------------------- tabs ---------------------------------- */

export type TabId =
  | "basics"
  | "description"
  | "variants"
  | "media"
  | "specs"
  | "seo";

export interface TabDefinition {
  id: TabId;
  label: string;
  /** Shown above the panel, so each one says what it is for. */
  hint: string;
  /**
   * The `PATCH /products/:id/{section}` calls this tab saves through, in
   * order. A list rather than one name because a tab does not map cleanly onto
   * a single endpoint: Basics carries pricing and stock alongside the general
   * fields, and those are three separate patches on the API.
   *
   * Empty means the tab has nothing the API can save on its own - Variants is
   * create-time only, and shipping has no section endpoint at all.
   */
  sections: string[];
}

export const PRODUCT_TABS: TabDefinition[] = [
  {
    id: "basics",
    label: "Basics",
    hint: "Name, catalogue placement, price and stock.",
    sections: ["general", "pricing", "stock"],
  },
  { id: "description", label: "Description", hint: "What the product page says about it.", sections: ["description"] },
  /*
   * Images before Variants, because a variant's picture defaults to the
   * product thumbnail - so the thumbnail wants to exist before the matrix is
   * generated, or every row starts with no image.
   */
  { id: "media", label: "Images", hint: "The thumbnail, and the product page gallery.", sections: ["media"] },
  { id: "variants", label: "Variants", hint: "Sizes, colours, and the SKUs they produce.", sections: [] },
  {
    id: "specs",
    label: "Specs & shipping",
    hint: "The spec table the shop filters on, and the parcel's weight and size.",
    sections: ["attributes"],
  },
  { id: "seo", label: "SEO", hint: "How it appears in a search result or a shared link.", sections: ["seo"] },
];

/* ------------------------------- validation ------------------------------- */

export type FieldErrors = Partial<Record<string, string>>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ATTRIBUTE_KEY = /^[a-z][a-z0-9_]*$/;

function isUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function numeric(value: string) {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

/**
 * One tab's rules.
 *
 * Returns a map of field name to message; an empty map means the tab may be
 * saved. Keys are the same names the inputs use, so a panel can mark its own
 * controls without a second lookup table.
 */
export function validateTab(
  tab: TabId,
  state: ProductFormState,
): FieldErrors {
  const errors: FieldErrors = {};

  if (tab === "basics") {
    if (!state.name.trim()) errors.name = "Required";
    else if (state.name.length > 240) errors.name = "At most 240 characters";

    if (!state.slug.trim()) errors.slug = "Required";
    else if (!SLUG.test(state.slug)) {
      errors.slug = "Lowercase letters, numbers and single hyphens only";
    }

    if (!state.categoryId) errors.categoryId = "Choose a category";

    if (state.sku.length > 120) errors.sku = "At most 120 characters";

    /*
     * Price and stock live on this tab too, so their rules run with it -
     * otherwise the tab could be saved with a price the `pricing` patch would
     * then reject on its own.
     */
    if (!numeric(state.sellingPrice)) errors.sellingPrice = "Enter a price";
    else if (Number(state.sellingPrice) < 0) {
      errors.sellingPrice = "Cannot be negative";
    }

    if (state.originalPrice.trim() !== "") {
      if (!numeric(state.originalPrice)) {
        errors.originalPrice = "Enter a number, or leave it blank";
      } else if (Number(state.originalPrice) < Number(state.sellingPrice)) {
        errors.originalPrice = "Cannot be below the selling price";
      }
    }

    if (state.trackInventory) {
      if (!numeric(state.quantity) || Number(state.quantity) < 0) {
        errors.quantity = "Enter a whole number";
      }
      if (!numeric(state.lowStockThreshold) || Number(state.lowStockThreshold) < 0) {
        errors.lowStockThreshold = "Enter a whole number";
      }
    }
  }

  if (tab === "description") {
    if (!state.description.trim()) errors.description = "Required";
    if (state.shortDescription.length > 600) {
      errors.shortDescription = "At most 600 characters";
    }
  }

  if (tab === "variants" && state.productType === "VARIABLE") {
    const named = state.axes.filter((axis) => axis.key.trim());

    if (named.length === 0) {
      errors.axes = "A variable product needs at least one option";
    }

    for (const axis of named) {
      if (!ATTRIBUTE_KEY.test(axis.key)) {
        errors.axes = `“${axis.key}” must start with a letter and use only lowercase letters, numbers and underscores`;
        break;
      }
      if (axis.values.length === 0) {
        errors.axes = `“${axis.key}” has no values`;
        break;
      }
    }

    const keys = named.map((axis) => axis.key);
    if (new Set(keys).size !== keys.length) {
      errors.axes = "Two options share the same key";
    }

    if (!errors.axes && state.variants.length === 0) {
      errors.variants = "Generate the variants before saving";
    }

    /*
     * SKUs must not repeat. The API takes them as optional free text and does
     * not check, but two variants sharing one makes the pair impossible to
     * tell apart in a stock report or a picking list - which is the entire
     * job of a stock-keeping unit.
     */
    const skus = state.variants
      .map((variant) => variant.sku.trim())
      .filter(Boolean);
    const duplicate = skus.find((sku, index) => skus.indexOf(sku) !== index);
    if (duplicate) {
      errors.variants = `Two variants share the SKU “${duplicate}”`;
    }

    for (const variant of state.variants) {
      if (variant.sellingPrice.trim() !== "" && !numeric(variant.sellingPrice)) {
        errors.variants = "Every variant price must be a number";
        break;
      }
      if (
        variant.originalPrice.trim() !== "" &&
        Number(variant.originalPrice) > 0 &&
        Number(variant.originalPrice) < Number(variant.sellingPrice)
      ) {
        errors.variants = "A variant's was-price is below its own price";
        break;
      }
    }
  }

  if (tab === "media") {
    if (!state.thumbnail?.src.trim()) {
      errors.thumbnail = "A thumbnail is required";
    }
    if (state.images.length > 100) errors.images = "At most 100 gallery images";
  }

  if (tab === "specs") {
    const keys: string[] = [];
    const titles: string[] = [];

    for (const group of state.specs) {
      if (!group.title.trim()) {
        errors.specs = "Every group needs a title";
        break;
      }
      const title = group.title.trim().toLowerCase();
      if (titles.includes(title)) {
        errors.specs = `Two groups are both called “${group.title}”`;
        break;
      }
      titles.push(title);

      if (group.options.length === 0) {
        errors.specs = `“${group.title}” has no rows`;
        break;
      }

      for (const option of group.options) {
        if (!option.key.trim() || !option.value.trim()) {
          errors.specs = "Every row needs a key and a value";
          break;
        }
        if (!ATTRIBUTE_KEY.test(option.key)) {
          errors.specs = `“${option.key}” must start with a letter and use only lowercase letters, numbers and underscores`;
          break;
        }
        /*
         * Unique across every group, not just within one. The storefront
         * filters on `attributes.options.<key>` and match any group, so a
         * repeated key makes the product filter wrong rather than fail.
         */
        if (keys.includes(option.key)) {
          errors.specs = `“${option.key}” is used in more than one group`;
          break;
        }
        keys.push(option.key);
      }
      if (errors.specs) break;
    }

    // Shipping shares this tab, so its numbers are checked with it.
    if (state.weightValue.trim() !== "" && !numeric(state.weightValue)) {
      errors.weightValue = "Enter a number";
    }
    for (const [field, value] of [
      ["length", state.length],
      ["width", state.width],
      ["height", state.height],
    ] as const) {
      if (value.trim() !== "" && !numeric(value)) errors[field] = "Enter a number";
    }
  }

  if (tab === "seo") {
    if (state.seoTitle.length > 70) errors.seoTitle = "At most 70 characters";
    if (state.seoDescription.length > 320) {
      errors.seoDescription = "At most 320 characters";
    }
    if (state.ogTitle.length > 95) errors.ogTitle = "At most 95 characters";
    if (state.ogDescription.length > 300) {
      errors.ogDescription = "At most 300 characters";
    }
    if (state.twitterTitle.length > 70) errors.twitterTitle = "At most 70 characters";
    if (state.twitterDescription.length > 200) {
      errors.twitterDescription = "At most 200 characters";
    }
    // Only what was typed - anything derived from the product is built from
    // values already validated elsewhere.
    for (const [field, value] of [
      ["canonicalUrl", state.canonicalUrl],
      ["ogImage", state.ogImage],
      ["twitterImage", state.twitterImage],
    ] as const) {
      if (value.trim() !== "" && !isUrl(value)) errors[field] = "Enter a full URL";
    }
  }

  return errors;
}

/** Which tabs currently have a problem, for the strip's error dots. */
export function invalidTabs(state: ProductFormState): Set<TabId> {
  const bad = new Set<TabId>();

  for (const tab of PRODUCT_TABS) {
    // A simple product has no variants to be wrong about.
    if (tab.id === "variants" && state.productType !== "VARIABLE") continue;
    if (Object.keys(validateTab(tab.id, state)).length > 0) bad.add(tab.id);
  }

  return bad;
}

/* -------------------------------- payloads -------------------------------- */

function specsToApi(specs: SpecGroup[]): AttributeGroup[] {
  return specs
    .filter((group) => group.title.trim() && group.options.length > 0)
    .map((group) => ({
      title: group.title.trim(),
      options: Object.fromEntries(
        group.options
          .filter((option) => option.key.trim() && option.value.trim())
          // A comma-separated value round-trips as the array the API accepts.
          .map((option) => [
            option.key.trim(),
            option.value.includes(",")
              ? option.value.split(",").map((part) => part.trim()).filter(Boolean)
              : option.value.trim(),
          ]),
      ),
    }));
}

/**
 * SEO text derived from the product itself.
 *
 * A blank meta title is not neutral - it leaves the search result showing
 * whatever the engine picks, usually a truncated URL - so the product's own
 * name and short description are a better default than nothing. Each field is
 * clipped to the length the API allows.
 *
 * Only ever used to fill *empty* fields; anything written by hand wins.
 */
export function seoFromProduct(state: ProductFormState) {
  const name = state.name.trim();
  const summary = state.shortDescription.trim();
  const image = state.thumbnail?.src.trim() ?? "";

  return {
    seoTitle: name.slice(0, 70),
    seoDescription: summary.slice(0, 320),
    // The thumbnail is the picture a shared link should show; without one,
    // Facebook and WhatsApp pick whatever they find on the page.
    ogTitle: name.slice(0, 95),
    ogDescription: summary.slice(0, 300),
    ogImage: image,
    twitterTitle: name.slice(0, 70),
    twitterDescription: summary.slice(0, 200),
    twitterImage: image,
    canonicalUrl: state.slug.trim() ? `${SITE_URL}/shop/${state.slug.trim()}` : "",
  };
}

function seoToApi(state: ProductFormState) {
  const seo: Record<string, unknown> = {
    keywords: state.seoKeywords,
    noIndex: state.noIndex,
    noFollow: state.noFollow,
  };

  // Every optional field is omitted rather than sent empty - the API's schema
  // is `.strict()` with `.url()` and length rules that "" would fail.
  // Empty fields fall back to the product's own words rather than going out
  // blank - see `seoFromProduct`.
  const fallback = seoFromProduct(state);

  const optional: [string, string][] = [
    ["title", state.seoTitle || fallback.seoTitle],
    ["description", state.seoDescription || fallback.seoDescription],
    ["canonicalUrl", state.canonicalUrl || fallback.canonicalUrl],
    ["ogTitle", state.ogTitle || fallback.ogTitle],
    ["ogDescription", state.ogDescription || fallback.ogDescription],
    ["ogImage", state.ogImage || fallback.ogImage],
    ["twitterTitle", state.twitterTitle || fallback.twitterTitle],
    ["twitterDescription", state.twitterDescription || fallback.twitterDescription],
    ["twitterImage", state.twitterImage || fallback.twitterImage],
  ];

  for (const [key, value] of optional) {
    if (value.trim()) seo[key] = value.trim();
  }

  return seo;
}

function galleryToApi(images: AdminImage[]) {
  return images.filter((image) => image.src.trim());
}

/**
 * Leaf id -> the ids the API should store, ancestors first.
 *
 * The form asks for one leaf, but a product belongs to its whole branch: a
 * storefront category page expands to its subtree, so filing an item only at
 * the leaf would hide it from every parent listing. The chain comes from the
 * tree rather than being typed.
 */
export function expandCategory(
  leafId: string,
  leaves: { id: string; ancestors: { id: string }[] }[],
): string[] {
  const leaf = leaves.find((entry) => entry.id === leafId);
  if (!leaf) return leafId ? [leafId] : [];
  return [...leaf.ancestors.map((entry) => entry.id), leaf.id];
}

/** Everything `POST /products` accepts, built from the whole form. */
export function toCreatePayload(
  state: ProductFormState,
  leaves: { id: string; ancestors: { id: string }[] }[] = [],
) {
  const gallery = galleryToApi(state.images);

  const payload: ProductWritePayload & Record<string, unknown> = {
    name: state.name.trim(),
    slug: state.slug.trim(),
    description: state.description,
    categoryIds: expandCategory(state.categoryId, leaves),
    status: state.status,
    visibility: state.visibility,
    featured: state.featured,
    currency: "BDT",
    sellingPrice: Number(state.sellingPrice),
    thumbnail: state.thumbnail!,
    productType: state.productType,
    tags: state.tags,
    attributes: specsToApi(state.specs),
    seo: seoToApi(state),
    stock: {
      trackInventory: state.trackInventory,
      quantity: Number(state.quantity || 0),
      lowStockThreshold: Number(state.lowStockThreshold || 0),
      allowBackorder: state.allowBackorder,
      status: state.stockStatus,
    },
    shipping: {
      requiresShipping: state.requiresShipping,
      freeShipping: state.freeShipping,
      ...(numeric(state.weightValue)
        ? { weight: { value: Number(state.weightValue), unit: state.weightUnit } }
        : {}),
      ...(numeric(state.length) && numeric(state.width) && numeric(state.height)
        ? {
            dimensions: {
              length: Number(state.length),
              width: Number(state.width),
              height: Number(state.height),
              unit: state.dimensionUnit,
            },
          }
        : {}),
    },
  };

  if (gallery.length > 0) payload.images = gallery;
  if (state.shortDescription.trim()) payload.shortDescription = state.shortDescription.trim();
  if (state.sku.trim()) payload.sku = state.sku.trim();
  if (state.brandId) payload.brandId = state.brandId;
  if (state.originalPrice.trim() && Number(state.originalPrice) > 0) {
    payload.originalPrice = Number(state.originalPrice);
  }

  if (state.productType === "VARIABLE") {
    const axes = state.axes.filter((axis) => axis.key.trim() && axis.values.length);

    payload.variationOptions = Object.fromEntries(
      axes.map((axis) => [axis.key, axis.values]),
    );

    /*
     * Every field comes from the row itself rather than from the product.
     * A variant is its own sellable thing - it can be out of stock while its
     * siblings are not, priced differently, and pictured differently - so
     * inheriting the product's stock settings here would quietly overwrite
     * what was set per row.
     */
    payload.variations = state.variants.map((variant, index) => ({
      options: variant.options,
      sortOrder: index,
      status: variant.status,
      stock: {
        trackInventory: variant.trackInventory,
        quantity: Number(variant.quantity || 0),
        allowBackorder: variant.allowBackorder,
        lowStockThreshold: Number(variant.lowStockThreshold || 0),
        status: variant.stockStatus,
      },
      // Blank means "derive it" - the API builds one from the product SKU and
      // the option values, so sending an empty string would be worse.
      ...(variant.sku.trim() ? { sku: variant.sku.trim() } : {}),
      ...(numeric(variant.sellingPrice)
        ? { sellingPrice: Number(variant.sellingPrice) }
        : {}),
      ...(numeric(variant.originalPrice) && Number(variant.originalPrice) > 0
        ? { originalPrice: Number(variant.originalPrice) }
        : {}),
      ...(variant.image?.src.trim()
        ? { image: { src: variant.image.src, alt: variant.image.alt } }
        : {}),
    }));
  }

  return payload;
}

/** The body for one tab's `PATCH`, on the edit screen. */
export function toPatchBody(
  section: string,
  state: ProductFormState,
  leaves: { id: string; ancestors: { id: string }[] }[] = [],
): unknown {
  if (section === "general") {
    return {
      name: state.name.trim(),
      slug: state.slug.trim(),
      categoryIds: expandCategory(state.categoryId, leaves),
      status: state.status,
      visibility: state.visibility,
      featured: state.featured,
      ...(state.sku.trim() ? { sku: state.sku.trim() } : {}),
      // `null` clears it; omitting would leave the old brand in place.
      brandId: state.brandId || null,
    };
  }

  if (section === "description") {
    return {
      description: state.description,
      shortDescription: state.shortDescription.trim() || null,
    };
  }

  if (section === "pricing") {
    return {
      sellingPrice: Number(state.sellingPrice),
      originalPrice:
        state.originalPrice.trim() && Number(state.originalPrice) > 0
          ? Number(state.originalPrice)
          : null,
    };
  }

  if (section === "media") {
    return {
      thumbnail: state.thumbnail ?? undefined,
      images: galleryToApi(state.images),
    };
  }

  if (section === "attributes") {
    return { attributes: specsToApi(state.specs), tags: state.tags };
  }

  if (section === "seo") {
    return { seo: seoToApi(state) };
  }

  if (section === "stock") return toStockBody(state);

  return {};
}

export function toStockBody(state: ProductFormState) {
  return {
    stock: {
      trackInventory: state.trackInventory,
      quantity: Number(state.quantity || 0),
      lowStockThreshold: Number(state.lowStockThreshold || 0),
      allowBackorder: state.allowBackorder,
      status: state.stockStatus,
    },
  };
}

export function signatureFor(options: Record<string, string>) {
  return signatureOf(options);
}
