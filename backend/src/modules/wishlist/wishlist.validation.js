"use strict";

const { z } = require("zod");
const { objectId } = require("../../shared/validators");
const { WISHLIST, PAGINATION } = require("../../shared/constants");

/**
 * The wishlist contract.
 *
 * Products only - no `variantId` anywhere, on purpose. A wishlist records "I
 * want this thing"; which size or colour is a decision made at the point of
 * buying, and a saved item should not vanish because one SKU was discontinued
 * while the product is still on sale.
 *
 * As with the cart, the owner is never a field: it comes from the verified
 * token, so no request shape can reach somebody else's list.
 */

const productIdBatch = z
  .array(objectId)
  .min(1, "At least one productId is required")
  .max(WISHLIST.MAX_BATCH_SIZE, `A request may carry at most ${WISHLIST.MAX_BATCH_SIZE} products`);

const addItems = { body: z.object({ productIds: productIdBatch }).strict() };

const removeItems = { body: z.object({ productIds: productIdBatch }).strict() };

/**
 * The heart icon. One product, and the caller does not have to know the
 * current state - which is the point, since the button that calls this is
 * usually rendered from a cached id list that may be a few seconds stale.
 */
const toggleItem = { body: z.object({ productId: objectId }).strict() };

const pagination = z
  .object({
    page: z.coerce.number().int().min(0).default(PAGINATION.DEFAULT_PAGE),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(PAGINATION.MAX_LIMIT)
      .default(PAGINATION.DEFAULT_LIMIT),
  })
  .strict()
  // `.prefault`, not `.default`: a Zod object default returns the literal
  // value given without applying the inner field defaults, which would leave
  // `page` undefined and `skip` NaN.
  .prefault({});

const priceRange = z
  .object({ min: z.coerce.number().min(0).optional(), max: z.coerce.number().min(0).optional() })
  .strict()
  .refine((range) => range.min != null || range.max != null, { message: "min or max is required" })
  .refine((range) => range.min == null || range.max == null || range.min <= range.max, {
    message: "min must not exceed max",
  });

/**
 * The saved-items listing.
 *
 * Filters are deliberately a smaller set than `POST /shop` offers. Category
 * and brand facets are absent because a category on the storefront expands to
 * its whole subtree, and supporting a flat version here would mean the same
 * parameter name meaning two different things in two endpoints - a worse
 * outcome than not having it. Search, price, stock and sort cover what a list
 * of a few dozen saved products actually needs.
 */
const filterItems = {
  body: z
    .object({
      search: z.string().trim().min(1).max(160).optional(),

      price: priceRange.optional(),

      /** Buyable right now. Saved items are routinely out of stock - that is
       *  half the reason people save them - so this is opt-in, never implied. */
      inStock: z.boolean().optional(),

      /**
       * Hide entries whose product has since been withdrawn, unpublished or
       * deleted. Off by default: an unavailable entry still comes back flagged,
       * because a row the shopper cannot see is a row they can never remove.
       */
      availableOnly: z.boolean().default(false),

      sort: z
        .object({
          // `addedAt` first because that is what a wishlist is - a list in the
          // order you saved things.
          field: z.enum(["addedAt", "price", "name"]).default("addedAt"),
          direction: z.enum(["asc", "desc"]).default("desc"),
        })
        .strict()
        .prefault({}),

      pagination,
    })
    .strict(),
};

module.exports = { addItems, removeItems, toggleItem, filterItems };
