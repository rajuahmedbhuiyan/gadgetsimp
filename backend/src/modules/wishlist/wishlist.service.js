"use strict";

const mongoose = require("mongoose");
const Wishlist = require("./wishlist.model");
const Product = require("../product/product.model");
const ApiError = require("../../shared/ApiError");
const {
  publicMatch,
  publicVisibilityExpr,
  priceStatsLookup,
  CARD_PROJECTION,
} = require("../product/product.query");
const { mapCatalogRecord } = require("../../shared/catalogSchemas");
const { WISHLIST, CART_ISSUE, PRODUCT_STATUS } = require("../../shared/constants");

/**
 * Saved products.
 *
 * Two rules shape this, and both are borrowed from the cart because a shopper
 * should not have to learn different behaviour for the two lists:
 *
 * **The catalog owns the truth.** A row stores a product id and when it was
 * saved. Price, stock and availability are resolved on every read, so a
 * wishlist can never show last month's price.
 *
 * **Reads never fail.** A saved product that has since been withdrawn still
 * comes back, flagged - because a row the shopper cannot see is a row they can
 * never remove. Writes are the strict half: saving something unbuyable is
 * refused and says why.
 *
 * The one place it deliberately diverges: **out of stock is not a reason to
 * refuse a save.** Saving something precisely because it is unavailable today
 * is half the point of a wishlist, so the write gate here is visibility only,
 * where the cart's is visibility *and* stock.
 */

/* ------------------------------- write side ------------------------------- */

/**
 * The products from this batch that may be saved.
 *
 * Uses `publicMatch()` - the storefront's own definition of visible - so
 * anything a shopper can see they can save, and nothing else. Note what it
 * admits: `OUT_OF_STOCK` is a visible state, which is exactly right here.
 */
async function visibleProductIds(productIds) {
  const ids = await Product.distinct("_id", {
    _id: { $in: productIds },
    ...publicMatch({}),
  });

  return new Set(ids.map(String));
}

function rejectUnavailable(productIds, visible, field = "productIds") {
  const errors = productIds
    .map((id, index) => ({ id, index }))
    .filter(({ id }) => !visible.has(id))
    .map(({ index }) => ({
      field: `${field}.${index}`,
      code: CART_ISSUE.PRODUCT_UNAVAILABLE,
      message: "This product is not available.",
    }));

  if (errors.length > 0) {
    throw ApiError.unprocessable("Some products could not be saved", {
      code: "WISHLIST_ITEMS_INVALID",
      errors,
    });
  }
}

async function assertRoom(userId, incoming) {
  const current = await Wishlist.countDocuments({ userId });

  if (current + incoming > WISHLIST.MAX_ITEMS) {
    throw ApiError.unprocessable(
      `A wishlist may hold at most ${WISHLIST.MAX_ITEMS} products. Remove something first.`,
      { code: "WISHLIST_FULL" }
    );
  }
}

/**
 * Saves a batch.
 *
 * **Idempotent.** Re-saving something already on the list is not an error -
 * the unique index turns the duplicate into a no-op and the response reports
 * it, because a client rendering hearts from a cached id list will
 * legitimately send one that is already saved.
 *
 * Unavailable products refuse the whole batch, matching the cart: a partly
 * applied mutation is hard for a UI to reconcile.
 */
async function addItems(userId, input) {
  // Duplicates within one request are collapsed rather than rejected - a
  // retried call or a double tap should mean "saved", not "error".
  const productIds = [...new Set(input.productIds)];

  const visible = await visibleProductIds(productIds);
  rejectUnavailable(productIds, visible);

  const existing = await Wishlist.find({ userId, productId: { $in: productIds } })
    .select({ productId: 1 })
    .lean();

  const already = new Set(existing.map((row) => String(row.productId)));
  const fresh = productIds.filter((id) => !already.has(id));

  await assertRoom(userId, fresh.length);

  if (fresh.length > 0) {
    await Wishlist.insertMany(
      fresh.map((productId) => ({
        userId,
        productId: new mongoose.Types.ObjectId(productId),
        addedAt: new Date(),
      })),
      // A concurrent identical save loses the unique-index race; that is the
      // desired outcome and not something to fail the request over.
      { ordered: false }
    ).catch((error) => {
      if (error?.code !== 11000) throw error;
    });
  }

  return {
    added: fresh,
    alreadySaved: productIds.filter((id) => already.has(id)),
    total: await Wishlist.countDocuments({ userId }),
  };
}

/**
 * Removes a batch.
 *
 * Idempotent for the same reason a cart removal is: an id that is already gone
 * is not an error, because the only ways to reach that state are a double tap
 * and a stale screen, and both should end with the item gone.
 */
async function removeItems(userId, input) {
  const productIds = [...new Set(input.productIds)];

  const result = await Wishlist.deleteMany({
    userId,
    productId: { $in: productIds.map((id) => new mongoose.Types.ObjectId(id)) },
  });

  return {
    removed: result.deletedCount,
    total: await Wishlist.countDocuments({ userId }),
  };
}

/**
 * The heart icon: saved becomes unsaved, unsaved becomes saved.
 *
 * The caller does not say which way, and that is the point - the button is
 * usually rendered from an id list that may be seconds stale, so a client
 * asserting "add" against a list that already has it would be wrong. Letting
 * the server decide from current state makes a double tap self-correcting.
 */
async function toggle(userId, input) {
  const productId = new mongoose.Types.ObjectId(input.productId);

  const removed = await Wishlist.findOneAndDelete({ userId, productId });

  if (removed) {
    return {
      productId: input.productId,
      inWishlist: false,
      total: await Wishlist.countDocuments({ userId }),
    };
  }

  // Only the add direction needs the catalog checked - removing something is
  // always allowed, including a product that has since been withdrawn.
  const visible = await visibleProductIds([input.productId]);
  rejectUnavailable([input.productId], visible, "productId");

  await assertRoom(userId, 1);

  try {
    await Wishlist.create({ userId, productId, addedAt: new Date() });
  } catch (error) {
    // Two taps racing: the loser finds it already saved, which is the state
    // the user asked for anyway.
    if (error?.code !== 11000) throw error;
  }

  return {
    productId: input.productId,
    inWishlist: true,
    total: await Wishlist.countDocuments({ userId }),
  };
}

async function clear(userId) {
  const result = await Wishlist.deleteMany({ userId });

  return { removed: result.deletedCount, total: 0 };
}

/* -------------------------------- read side ------------------------------- */

/**
 * Every saved product id, and nothing else.
 *
 * Its own endpoint because a storefront grid needs to fill in a hundred heart
 * icons on load, and asking the paginated listing for that would mean either
 * several round trips or shipping a hundred full product cards to render a
 * hundred booleans. One projected query against the compound index, no joins
 * to the catalog at all.
 *
 * Deliberately unpaginated - it is capped at `WISHLIST.MAX_ITEMS` ids, which
 * is a few kilobytes.
 */
async function listIds(userId) {
  const rows = await Wishlist.find({ userId })
    .select({ productId: 1, _id: 0 })
    .sort({ addedAt: -1 })
    .lean();

  const productIds = rows.map((row) => String(row.productId));

  return { productIds, total: productIds.length };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sortStage(sort) {
  const direction = sort.direction === "asc" ? 1 : -1;

  // `_id` breaks ties so pagination cannot show the same row on two pages.
  if (sort.field === "price") return { effectiveMinPrice: direction, _id: 1 };
  if (sort.field === "name") return { name: direction, _id: 1 };

  return { addedAt: direction, _id: 1 };
}

/**
 * The saved-items listing, with live product data.
 *
 * Built as one aggregation from the wishlist side rather than fetching ids and
 * then querying products, because the sort key (`addedAt`) lives on the
 * wishlist row while the filters live on the product - splitting it would mean
 * paginating one and filtering the other, which cannot give a correct page
 * count.
 *
 * The join keeps rows whose product is missing (`preserveNullAndEmptyArrays`)
 * so a withdrawn product still appears, flagged, instead of silently vanishing
 * from a list the shopper curated.
 */
async function list(userId, params) {
  const { page, limit } = params.pagination;

  const pipeline = [
    { $match: { userId } },
    {
      $lookup: {
        from: Product.collection.name,
        localField: "productId",
        foreignField: "_id",
        as: "_product",
      },
    },
    { $unwind: { path: "$_product", preserveNullAndEmptyArrays: true } },
    {
      // Promote the product to the root so every stage below - including the
      // shared card projection - operates on a product document, exactly as
      // the storefront listing does.
      $replaceRoot: {
        newRoot: {
          $mergeObjects: [
            "$_product",
            { addedAt: "$addedAt", productId: "$productId", wishlistId: "$_id" },
          ],
        },
      },
    },
    // The storefront's visibility rule as a boolean, not a filter: a withdrawn
    // product is flagged here and only removed if `availableOnly` asks.
    { $addFields: { available: publicVisibilityExpr() } },
  ];

  if (params.availableOnly) pipeline.push({ $match: { available: true } });

  if (params.search) {
    // A regex rather than `$text`: a text index can only be used in the first
    // stage of a pipeline, and by here the product has already been joined.
    // A wishlist is small enough that the difference does not matter.
    pipeline.push({ $match: { name: { $regex: escapeRegex(params.search), $options: "i" } } });
  }

  pipeline.push(priceStatsLookup());
  pipeline.push({
    $addFields: {
      effectiveMinPrice: { $ifNull: ["$sellingPrice", { $arrayElemAt: ["$_priceStats.min", 0] }] },
      effectiveMaxPrice: { $ifNull: ["$sellingPrice", { $arrayElemAt: ["$_priceStats.max", 0] }] },
    },
  });

  // Price filters run against the **effective** price, so a variable product
  // is matched on its variant range rather than a price it does not have.
  if (params.price) {
    const condition = {};
    if (params.price.min != null) condition.$gte = params.price.min;
    if (params.price.max != null) condition.$lte = params.price.max;
    pipeline.push({ $match: { effectiveMinPrice: condition } });
  }

  if (params.inStock != null) {
    pipeline.push({
      $addFields: {
        _buyable: {
          $and: [
            { $ne: ["$status", PRODUCT_STATUS.OUT_OF_STOCK] },
            {
              $or: [
                { $eq: ["$stock.trackInventory", false] },
                { $gt: ["$stock.quantity", 0] },
                { $eq: ["$stock.allowBackorder", true] },
              ],
            },
          ],
        },
      },
    });
    pipeline.push({ $match: { _buyable: params.inStock } });
  }

  pipeline.push({ $sort: sortStage(params.sort) });
  pipeline.push({
    $facet: {
      items: [
        { $skip: page * limit },
        { $limit: limit },
        { $lookup: { from: "brands", localField: "brandId", foreignField: "_id", as: "_brand" } },
        {
          $project: {
            // The same card shape the storefront grid renders, from the same
            // definition - a saved item and a browsed item must not disagree
            // about price or discount.
            ...CARD_PROJECTION,
            addedAt: 1,
            available: 1,
            productId: 1,
          },
        },
      ],
      total: [{ $count: "count" }],
    },
  });

  const [result] = await Wishlist.aggregate(pipeline);

  return {
    items: (result?.items ?? []).map((record) => present(record)),
    total: result?.total?.[0]?.count ?? 0,
    page,
    limit,
  };
}

/**
 * One saved row as JSON.
 *
 * A product that was hard-deleted leaves nothing to project, so the fields
 * come back null with `available: false` and the id still present - enough for
 * the UI to render "no longer available" next to a working remove button.
 */
function present(record) {
  const { productId, available, addedAt, ...card } = record;
  const item = mapCatalogRecord(card);

  if (item.brandId?.id) item.brandId.id = String(item.brandId.id);

  return {
    ...item,
    // Always the wishlist's own reference, so a row survives its product
    // disappearing and can still be removed by id.
    id: String(productId),
    available: Boolean(available),
    addedAt,
  };
}

module.exports = { addItems, removeItems, toggle, clear, list, listIds };
