"use strict";

const Product = require("./product.model");
const Variant = require("./variant.model");
const { publicMatch, variantPublicMatch } = require("./product.query");
const { CART_ISSUE, PRODUCT_STATUS, PRODUCT_TYPE } = require("../../shared/constants");

/**
 * Turning "the customer picked this" into "here is what it costs and how many
 * are left".
 *
 * Both the cart and the checkout have to answer the same questions - does this
 * product exist, is it visible, does it need a variant, does that variant
 * belong to it, what does it cost, how many remain - and they must answer them
 * identically. If they ever disagree, an item is addable to a cart but
 * unorderable, or worse, orderable at a price the cart never showed.
 *
 * What they do with the answer differs, and that difference stays with the
 * caller: the cart caps an over-large quantity and carries on, because a
 * basket is a draft; the checkout refuses it, because an order is a
 * commitment and quietly shipping fewer than someone agreed to buy is not a
 * quantity adjustment, it is the wrong order.
 */

/**
 * How many units may still be taken, or `null` for "no ceiling".
 *
 * Null rather than Infinity because it survives JSON, and the two unlimited
 * cases are genuinely unlimited: a product that does not track inventory has
 * no number to run out of, and one that accepts backorders has decided that
 * running out is not a reason to stop selling.
 */
function availableUnits(stock) {
  if (!stock?.trackInventory) return null;
  if (stock.allowBackorder) return null;
  return Math.max(0, stock.quantity ?? 0);
}

const PRODUCT_FIELDS = {
  name: 1,
  slug: 1,
  thumbnail: 1,
  productType: 1,
  currency: 1,
  sellingPrice: 1,
  originalPrice: 1,
  stock: 1,
  status: 1,
};

const VARIANT_FIELDS = {
  productId: 1,
  sku: 1,
  options: 1,
  sellingPrice: 1,
  originalPrice: 1,
  stock: 1,
  status: 1,
  image: 1,
};

/**
 * Loads everything a set of selections refers to.
 *
 * Each entity is fetched twice, and deliberately: once unfiltered for its
 * display fields, and once through the shared visibility gate to learn whether
 * it is still public. That is what lets an unavailable line still render its
 * own name - "Nike T-Shirt is no longer available" instead of "item
 * unavailable" - while keeping exactly one definition of "publicly visible",
 * imported from the catalog query rather than restated here. Both queries are
 * `_id: {$in}` against the primary key.
 */
async function loadSelections(lines) {
  const productIds = [...new Set(lines.map((line) => String(line.productId)))];
  const variantIds = [
    ...new Set(lines.filter((line) => line.variantId).map((line) => String(line.variantId))),
  ];

  const [products, visibleProductIds, variants, visibleVariantIds] = await Promise.all([
    Product.find({ _id: { $in: productIds } }).select(PRODUCT_FIELDS).lean(),
    Product.distinct("_id", { _id: { $in: productIds }, ...publicMatch({}) }),
    variantIds.length
      ? Variant.find({ _id: { $in: variantIds } }).select(VARIANT_FIELDS).lean()
      : [],
    variantIds.length
      ? Variant.distinct("_id", { _id: { $in: variantIds }, ...variantPublicMatch() })
      : [],
  ]);

  return {
    products: new Map(products.map((product) => [String(product._id), product])),
    visibleProducts: new Set(visibleProductIds.map(String)),
    variants: new Map(variants.map((variant) => [String(variant._id), variant])),
    visibleVariants: new Set(visibleVariantIds.map(String)),
  };
}

/** The options joined for display - "Black / M" under a product name. */
function variantLabel(options) {
  if (!options) return null;
  const entries = options instanceof Map ? [...options.entries()] : Object.entries(options);
  return entries.map(([, value]) => String(value)).join(" / ") || null;
}

function optionsObject(variant) {
  if (!variant?.options) return {};
  return variant.options instanceof Map ? Object.fromEntries(variant.options) : variant.options;
}

/**
 * Decides whether one selection may be bought at all.
 *
 * The variant rules are the substance here. A VARIABLE product is not itself
 * purchasable - it is a family of SKUs, and buying one without saying which
 * would leave the warehouse guessing which colour to pack - so a variant is
 * required. A SIMPLE product has none, and being handed one means the client
 * is confused about which product it is looking at, which is worth saying out
 * loud rather than ignoring.
 *
 * @returns {{error?: {field: string, code: string, message: string}}} on
 *   rejection, otherwise the resolved product, variant, stock ceiling and price.
 */
function checkSelection(entry, catalog) {
  const productId = String(entry.productId);
  const product = catalog.products.get(productId);

  // Unknown and not-visible are answered identically, so a draft product's
  // existence cannot be probed through the cart or the checkout.
  if (!product || !catalog.visibleProducts.has(productId)) {
    return {
      error: {
        field: "productId",
        code: CART_ISSUE.PRODUCT_UNAVAILABLE,
        message: "This product is not available.",
      },
    };
  }

  if (product.status !== PRODUCT_STATUS.ACTIVE) {
    return {
      error: {
        field: "productId",
        code: CART_ISSUE.OUT_OF_STOCK,
        message: `${product.name} is out of stock.`,
      },
    };
  }

  if (product.productType === PRODUCT_TYPE.VARIABLE && !entry.variantId) {
    return {
      error: {
        field: "variantId",
        code: "VARIANT_REQUIRED",
        message: `${product.name} has options - choose one before adding it.`,
      },
    };
  }

  if (product.productType === PRODUCT_TYPE.SIMPLE && entry.variantId) {
    return {
      error: {
        field: "variantId",
        code: "VARIANT_NOT_ALLOWED",
        message: `${product.name} has no options, so no variant may be selected.`,
      },
    };
  }

  let variant = null;

  if (entry.variantId) {
    const variantId = String(entry.variantId);
    variant = catalog.variants.get(variantId);

    if (!variant || !catalog.visibleVariants.has(variantId)) {
      return {
        error: {
          field: "variantId",
          code: CART_ISSUE.VARIANT_UNAVAILABLE,
          message: "The option you chose is not available.",
        },
      };
    }

    // A variant id belonging to a different product would otherwise price and
    // stock this line from something the shopper never looked at.
    if (String(variant.productId) !== productId) {
      return {
        error: {
          field: "variantId",
          code: "VARIANT_PRODUCT_MISMATCH",
          message: "That option belongs to a different product.",
        },
      };
    }

    if (variant.status !== PRODUCT_STATUS.ACTIVE) {
      return {
        error: {
          field: "variantId",
          code: CART_ISSUE.OUT_OF_STOCK,
          message: "The option you chose is out of stock.",
        },
      };
    }
  }

  const source = variant ?? product;
  const available = availableUnits(source.stock);

  if (available === 0) {
    return {
      error: {
        field: "productId",
        code: CART_ISSUE.OUT_OF_STOCK,
        message: `${product.name} is out of stock.`,
      },
    };
  }

  return {
    product,
    variant,
    available,
    unitPrice: source.sellingPrice,
    originalPrice: source.originalPrice ?? null,
    // Whether taking units from this actually moves inventory. Both the cart
    // and the checkout need it, and reading `stock` twice in two places is how
    // the two drift.
    tracksInventory: Boolean(source.stock?.trackInventory),
    allowsBackorder: Boolean(source.stock?.allowBackorder),
  };
}

module.exports = {
  availableUnits,
  loadSelections,
  checkSelection,
  variantLabel,
  optionsObject,
};
