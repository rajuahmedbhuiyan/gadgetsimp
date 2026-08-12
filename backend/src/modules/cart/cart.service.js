"use strict";

const mongoose = require("mongoose");
const Cart = require("./cart.model");
const ApiError = require("../../shared/ApiError");
const {
  availableUnits,
  loadSelections,
  checkSelection,
  variantLabel,
  optionsObject,
} = require("../product/purchasable");
const { CART, CART_ISSUE, PRODUCT_STATUS } = require("../../shared/constants");

/**
 * The cart.
 *
 * Three rules shape everything below.
 *
 * **1. The cart stores intent, the catalog owns the truth.** A line records a
 * product, a variant and a count. Price, stock and availability are resolved
 * from the catalog on every single read, so a cart cannot serve a price that
 * no longer exists or hide that something sold out overnight.
 *
 * **2. Reads never fail, writes fail loudly.** Loading a cart whose product was
 * unpublished last night must still succeed - flagging the row, not rejecting
 * the request - or the shopper is locked out of their own basket with no way
 * to remove the offending line. Adding something unbuyable, by contrast, is
 * refused outright and says which item and why.
 *
 * **3. A batch applies completely or not at all.** Hard problems (unknown
 * product, missing variant choice) reject the whole request with a per-item
 * reason. Only quantity is ever adjusted rather than refused, because "you
 * asked for 10, there are 3" has an obviously right answer, and every
 * adjustment is reported back.
 */

/* ------------------------------ stock rules ------------------------------ */

function ceilingFor(available) {
  return Math.min(CART.MAX_QUANTITY_PER_LINE, available ?? Number.POSITIVE_INFINITY);
}

/**
 * Identity of a cart line.
 *
 * A product plus a variant, not a product - which is the whole reason a
 * variable product can sit in a cart twice as "black / M" and "white / L"
 * without the two collapsing into one row.
 */
function lineKey(productId, variantId) {
  return `${String(productId)}:${variantId ? String(variantId) : ""}`;
}

/** Money is summed, so it is rounded once at the end rather than drifting. */
function money(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/* ------------------------------ presentation ------------------------------ */

function issue(code, message) {
  return { code, message };
}

function presentVariant(variant) {
  if (!variant) return null;

  const options = optionsObject(variant);

  return {
    id: String(variant._id),
    sku: variant.sku,
    options,
    label: variantLabel(options),
    image: variant.image ?? null,
  };
}

/**
 * One cart row, priced and checked.
 *
 * `purchasable` is the single field a checkout should gate on: it already
 * folds in "product withdrawn", "option withdrawn", "sold out" and "you are
 * holding more than exists". `issues` explains which of those applied, so the
 * UI can say something specific rather than greying the row out silently.
 */
function presentLine(item, catalog) {
  const productId = String(item.productId);
  const variantId = item.variantId ? String(item.variantId) : null;

  const product = catalog.products.get(productId);
  const variant = variantId ? catalog.variants.get(variantId) : null;

  const issues = [];

  const productOk = Boolean(product) && catalog.visibleProducts.has(productId);
  const variantOk =
    !variantId ||
    (Boolean(variant) &&
      catalog.visibleVariants.has(variantId) &&
      String(variant.productId) === productId);

  if (!productOk) {
    issues.push(issue(CART_ISSUE.PRODUCT_UNAVAILABLE, "This product is no longer available."));
  } else if (!variantOk) {
    issues.push(issue(CART_ISSUE.VARIANT_UNAVAILABLE, "The option you chose is no longer available."));
  }

  /**
   * Stock and price live on the variant when there is one - a variable
   * product's own stock block is not what gets shipped.
   *
   * The ownership check matters even though `variantOk` already covers it: a
   * variant belonging to a different product must never price this line, but
   * a *withdrawn* one still should, so the row can show "Nike T-Shirt, ৳1299,
   * no longer available" rather than a nameless blank with no price.
   */
  const source = variant && String(variant.productId) === productId ? variant : product;
  const known = productOk && variantOk;
  const available = known ? availableUnits(source.stock) : 0;

  const soldOut =
    known &&
    (product.status === PRODUCT_STATUS.OUT_OF_STOCK ||
      (variant && variant.status === PRODUCT_STATUS.OUT_OF_STOCK) ||
      available === 0);

  if (soldOut) issues.push(issue(CART_ISSUE.OUT_OF_STOCK, "This item is out of stock."));

  const overStocked = known && !soldOut && available != null && item.quantity > available;

  if (overStocked) {
    issues.push(
      issue(
        CART_ISSUE.INSUFFICIENT_STOCK,
        `Only ${available} left in stock. Reduce the quantity to continue.`
      )
    );
  }

  const purchasable = known && !soldOut && !overStocked;

  const unitPrice = source?.sellingPrice ?? null;
  const originalPrice = source?.originalPrice ?? null;

  if (purchasable && item.priceAtAdd != null && unitPrice != null && item.priceAtAdd !== unitPrice) {
    issues.push(
      issue(
        CART_ISSUE.PRICE_CHANGED,
        unitPrice > item.priceAtAdd
          ? "The price has gone up since you added this."
          : "The price has dropped since you added this."
      )
    );
  }

  const lineTotal = unitPrice == null ? 0 : money(unitPrice * item.quantity);

  return {
    id: String(item._id),
    product: product
      ? {
          id: productId,
          name: product.name,
          slug: product.slug,
          thumbnail: product.thumbnail ?? null,
          productType: product.productType,
        }
      : { id: productId, name: null, slug: null, thumbnail: null, productType: null },
    variant: presentVariant(variant),
    quantity: item.quantity,
    currency: product?.currency ?? "BDT",
    unitPrice,
    originalPrice,
    discountPercent:
      originalPrice && unitPrice != null && originalPrice > unitPrice
        ? Math.round(((originalPrice - unitPrice) / originalPrice) * 100)
        : 0,
    lineTotal,
    originalLineTotal: money((originalPrice ?? unitPrice ?? 0) * item.quantity),
    availability: {
      purchasable,
      inStock: known && !soldOut,
      // `null` means no ceiling, not "zero left".
      maxQuantity: known ? available : 0,
    },
    issues,
    addedAt: item.addedAt,
  };
}

/**
 * Totals.
 *
 * Money counts **purchasable lines only**. A subtotal that includes a
 * withdrawn product is a number the shopper cannot actually pay, and showing
 * it means the figure silently drops at checkout - the worst possible moment
 * to discover it. `totalQuantity` does count every line, because that is the
 * header badge and a row that is still sitting in the cart should still be
 * counted there.
 */
function summarise(lines) {
  let subtotal = 0;
  let originalSubtotal = 0;
  let totalQuantity = 0;
  let unavailableCount = 0;

  for (const line of lines) {
    totalQuantity += line.quantity;

    if (line.availability.purchasable) {
      subtotal += line.lineTotal;
      originalSubtotal += line.originalLineTotal;
    } else {
      unavailableCount += 1;
    }
  }

  return {
    currency: lines[0]?.currency ?? "BDT",
    itemCount: lines.length,
    totalQuantity,
    subtotal: money(subtotal),
    originalSubtotal: money(originalSubtotal),
    discount: money(originalSubtotal - subtotal),
    unavailableCount,
    hasIssues: lines.some((line) => line.issues.length > 0),
    // Everything present is buyable, and there is something to buy.
    checkoutReady: lines.length > 0 && unavailableCount === 0,
  };
}

function emptySummary() {
  return {
    currency: "BDT",
    itemCount: 0,
    totalQuantity: 0,
    subtotal: 0,
    originalSubtotal: 0,
    discount: 0,
    unavailableCount: 0,
    hasIssues: false,
    checkoutReady: false,
  };
}

/**
 * The response shape, identical for every endpoint including the empty case.
 *
 * Every mutation answers with the whole cart rather than just what changed, so
 * a client never has to merge a delta into local state and never drifts out of
 * sync with the server - which matters more than usual here, because quantities
 * can come back adjusted.
 */
async function presentCart(cartDoc) {
  const items = cartDoc?.items ?? [];

  if (items.length === 0) {
    return { items: [], summary: emptySummary(), updatedAt: cartDoc?.updatedAt ?? null };
  }

  const catalog = await loadSelections(items);
  const lines = items.map((item) => presentLine(item, catalog));

  return { items: lines, summary: summarise(lines), updatedAt: cartDoc?.updatedAt ?? null };
}

/* -------------------------------- failures -------------------------------- */

function itemsRejected(message, errors) {
  return ApiError.unprocessable(message, { code: "CART_ITEMS_INVALID", errors });
}

function cartFull() {
  return ApiError.unprocessable(
    `A cart may hold at most ${CART.MAX_LINES} different items. Remove something first.`,
    { code: "CART_FULL" }
  );
}

/* ------------------------------ write helpers ----------------------------- */

/**
 * Opens the caller's cart, creating it on first use.
 *
 * An upsert rather than find-then-create: two requests arriving together would
 * both see nothing and both insert, and the unique index would turn the loser
 * into a 409 on an operation the user did nothing wrong in. `$setOnInsert`
 * makes the create a no-op when the cart already exists.
 */
async function openCart(userId) {
  return Cart.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, items: [] } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
}

/**
 * Runs a read-modify-write against the cart, retrying if someone else got
 * there first.
 *
 * The cart is the one document a single user writes to from several places at
 * once - two tabs, or a double-tapped "add to cart". Optimistic concurrency on
 * the schema turns the losing write into a `VersionError` instead of a silently
 * lost increment; this retries it against fresh state, so the user sees a
 * correct cart rather than an error for something that is not their problem.
 *
 * Only after genuinely losing three times does it surface, and then as a 409
 * the client can retry - never as a 500.
 */
async function withCartWrite(operation, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const contended = error instanceof mongoose.Error.VersionError || error?.code === 11000;

      if (!contended) throw error;

      if (attempt >= attempts) {
        throw ApiError.conflict("Your cart changed while this request was in flight. Try again.", {
          code: "CART_CONFLICT",
          cause: error,
        });
      }
    }
  }
}

/**
 * Collapses a batch that names the same product and variant more than once.
 *
 * Sending "1 × black M" twice means two, not an error - a client retrying a
 * flaky request or a user tapping twice should not be met with a validation
 * failure. Original positions are kept so any rejection still points at the
 * item the caller actually sent.
 */
function groupRequested(items) {
  const byKey = new Map();

  items.forEach((item, index) => {
    const variantId = item.variantId ?? null;
    const key = lineKey(item.productId, variantId);
    const existing = byKey.get(key);

    if (existing) {
      existing.quantity += item.quantity;
      existing.indexes.push(index);
    } else {
      byKey.set(key, {
        productId: item.productId,
        variantId,
        quantity: item.quantity,
        indexes: [index],
      });
    }
  });

  return [...byKey.values()];
}

function adjustment(entry, requested, applied, reason) {
  return {
    productId: String(entry.productId),
    variantId: entry.variantId ? String(entry.variantId) : null,
    requested,
    applied,
    code: CART_ISSUE.QUANTITY_ADJUSTED,
    message: reason,
  };
}

/* -------------------------------- commands -------------------------------- */

/**
 * The caller's cart. Never creates one - a shopper who has only ever browsed
 * should not leave a row behind, and an empty cart reads the same either way.
 */
async function getCart(userId) {
  const cart = await Cart.findOne({ userId }).lean();

  return { cart: await presentCart(cart), adjustments: [] };
}

/**
 * Adds a batch, merging into existing lines.
 *
 * Adding something already in the cart increases its quantity rather than
 * creating a second identical row - which is what a shopper means by it, and
 * what stops a cart filling with duplicates of one product.
 */
async function addItems(userId, input) {
  const grouped = groupRequested(input.items);
  const catalog = await loadSelections(grouped);

  const errors = [];
  const resolved = [];

  for (const entry of grouped) {
    const outcome = checkSelection(entry, catalog);

    if (outcome.error) {
      errors.push({
        // The first position this product/variant appeared at, so the message
        // points into the array the caller actually sent.
        field: `items.${entry.indexes[0]}.${outcome.error.field}`,
        code: outcome.error.code,
        message: outcome.error.message,
      });
    } else {
      resolved.push({ ...entry, ...outcome });
    }
  }

  if (errors.length > 0) {
    throw itemsRejected("Some items could not be added to your cart", errors);
  }

  return withCartWrite(async () => {
    const cart = await openCart(userId);
    const adjustments = [];

    for (const entry of resolved) {
      const key = lineKey(entry.productId, entry.variantId);
      const existing = cart.items.find(
        (item) => lineKey(item.productId, item.variantId) === key
      );

      const ceiling = ceilingFor(entry.available);
      const desired = (existing?.quantity ?? 0) + entry.quantity;
      const applied = Math.min(desired, ceiling);

      if (applied < desired) {
        adjustments.push(
          adjustment(
            entry,
            desired,
            applied,
            entry.available != null && ceiling === entry.available
              ? `Only ${entry.available} left in stock, so the quantity was capped.`
              : `A cart may hold at most ${CART.MAX_QUANTITY_PER_LINE} of one item.`
          )
        );
      }

      if (existing) {
        existing.quantity = applied;
        // Re-added at today's price, so that is the price to compare against
        // from now on - otherwise a stale "price changed" banner never clears.
        existing.priceAtAdd = entry.unitPrice;
      } else {
        cart.items.push({
          productId: entry.productId,
          variantId: entry.variantId,
          quantity: applied,
          priceAtAdd: entry.unitPrice,
          addedAt: new Date(),
        });
      }
    }

    if (cart.items.length > CART.MAX_LINES) throw cartFull();

    await cart.save();

    return { cart: await presentCart(cart.toObject()), adjustments };
  });
}

/**
 * Updates quantities in bulk, addressed by line id.
 *
 * Deliberately permissive about availability: the quantity of a line whose
 * product has since been withdrawn can still be changed, because the
 * alternative is a row the shopper can neither fix nor reduce. What it will
 * not do is invent a line - an unknown id means the client is out of sync, and
 * silently ignoring it would leave the screen showing a number the server
 * never accepted.
 */
async function updateItems(userId, input) {
  return withCartWrite(async () => {
    const cart = await openCart(userId);

    const byId = new Map(cart.items.map((item) => [String(item._id), item]));

    const unknown = input.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !byId.has(item.itemId));

    if (unknown.length > 0) {
      throw itemsRejected(
        "Some items are no longer in your cart",
        unknown.map(({ item, index }) => ({
          field: `items.${index}.itemId`,
          code: "CART_ITEM_NOT_FOUND",
          message: `No cart item with id ${item.itemId}.`,
        }))
      );
    }

    const targets = input.items
      .filter((item) => item.quantity > 0)
      .map((item) => byId.get(item.itemId));

    const catalog = await loadSelections(targets);
    const adjustments = [];
    const removals = new Set();

    for (const requested of input.items) {
      const line = byId.get(requested.itemId);

      // Zero is a removal, so the stepper on a cart row can decrement to
      // nothing without the client switching endpoints mid-interaction.
      if (requested.quantity === 0) {
        removals.add(requested.itemId);
        continue;
      }

      const variantId = line.variantId ? String(line.variantId) : null;
      const source =
        (variantId ? catalog.variants.get(variantId) : null) ??
        catalog.products.get(String(line.productId));

      /**
       * A ceiling of zero means the item sold out entirely while it sat in
       * the cart. Clamping to it would drive the line to quantity 0 - which
       * the schema forbids, and which would silently delete a row the shopper
       * asked to keep. The quantity stands; the read flags it as out of stock
       * and they can remove it themselves.
       */
      const ceiling = ceilingFor(availableUnits(source?.stock));
      const applied = ceiling > 0 ? Math.min(requested.quantity, ceiling) : requested.quantity;

      if (applied < requested.quantity) {
        adjustments.push(
          adjustment(
            line,
            requested.quantity,
            applied,
            Number.isFinite(ceiling) && ceiling < CART.MAX_QUANTITY_PER_LINE
              ? `Only ${ceiling} left in stock, so the quantity was capped.`
              : `A cart may hold at most ${CART.MAX_QUANTITY_PER_LINE} of one item.`
          )
        );
      }

      line.quantity = applied;
    }

    if (removals.size > 0) {
      cart.items = cart.items.filter((item) => !removals.has(String(item._id)));
    }

    await cart.save();

    return { cart: await presentCart(cart.toObject()), adjustments };
  });
}

/**
 * Removes lines in bulk.
 *
 * Idempotent on purpose: an id that is already gone is not an error, because
 * the only way to reach that state is a double-tapped remove or a stale
 * screen, and both should end with the item gone rather than with a dialog.
 * The ids that were not there come back in `notFound` for anyone who cares.
 *
 * `$pull` in a single update rather than a read-modify-write, so no version
 * conflict is possible and a concurrent add is untouched.
 */
async function removeItems(userId, input) {
  const cart = await Cart.findOne({ userId }).lean();

  if (!cart) {
    return { cart: await presentCart(null), adjustments: [], removed: 0, notFound: input.itemIds };
  }

  const existingIds = new Set(cart.items.map((item) => String(item._id)));
  const matched = input.itemIds.filter((id) => existingIds.has(id));
  const notFound = input.itemIds.filter((id) => !existingIds.has(id));

  if (matched.length > 0) {
    await Cart.updateOne(
      { userId },
      { $pull: { items: { _id: { $in: matched.map((id) => new mongoose.Types.ObjectId(id)) } } } }
    );
  }

  const updated = await Cart.findOne({ userId }).lean();

  return {
    cart: await presentCart(updated),
    adjustments: [],
    removed: matched.length,
    notFound,
  };
}

/**
 * Empties the cart, keeping the document.
 *
 * Deleting the row instead would lose `createdAt`, and the document is one
 * small record per user either way.
 */
async function clear(userId) {
  const cart = await Cart.findOneAndUpdate(
    { userId },
    { $set: { items: [] } },
    { returnDocument: "after" }
  ).lean();

  return { cart: await presentCart(cart), adjustments: [] };
}

/**
 * Just the numbers behind the header badge.
 *
 * A separate endpoint because this runs on every page load of the whole site,
 * and it has no business pricing lines or checking stock to answer "3".
 */
async function count(userId) {
  const cart = await Cart.findOne({ userId }).select({ "items.quantity": 1 }).lean();
  const items = cart?.items ?? [];

  return {
    itemCount: items.length,
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
  };
}

module.exports = { getCart, addItems, updateItems, removeItems, clear, count };
