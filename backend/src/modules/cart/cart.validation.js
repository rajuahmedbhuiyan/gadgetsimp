"use strict";

const { z } = require("zod");
const { objectId } = require("../../shared/validators");
const { CART } = require("../../shared/constants");

/**
 * The cart contract.
 *
 * Every mutation is a **batch**, including the one-item case. A single-item
 * endpoint alongside a batch one means two code paths for the same rule, and
 * the one used less is the one that drifts - so `{ items: [one] }` is the
 * cheap price of having exactly one implementation of "add to cart".
 *
 * Ids are ObjectIds here, not slugs: unlike the storefront, the cart is only
 * ever populated from data the API itself just returned, so there is no URL to
 * keep readable and no lookup to save.
 */

const quantity = z
  .number()
  .int("Quantity must be a whole number")
  .min(1, "Quantity must be at least 1")
  .max(CART.MAX_QUANTITY_PER_LINE, `Quantity must not exceed ${CART.MAX_QUANTITY_PER_LINE}`);

/**
 * One requested line.
 *
 * `variantId` is optional *here* and resolved against the product in the
 * service, because whether it is required depends on the product's type -
 * something Zod cannot know without a database read. Sending `null` is
 * accepted and means the same as omitting it, so a client can hand back a
 * variant field it renders as empty without special-casing.
 */
const requestedItem = z
  .object({
    productId: objectId,
    variantId: objectId.nullish(),
    quantity: quantity.default(1),
  })
  .strict();

const itemBatch = z
  .array(requestedItem)
  .min(1, "At least one item is required")
  .max(CART.MAX_BATCH_SIZE, `A request may carry at most ${CART.MAX_BATCH_SIZE} items`);

const addItems = {
  body: z.object({ items: itemBatch }).strict(),
};

/**
 * Batch update, addressed by line id.
 *
 * `quantity: 0` removes the line. That is not a shortcut for its own sake: the
 * stepper control next to every cart row decrements to zero, and making the
 * client notice that and switch to a different endpoint mid-interaction is how
 * "the last one won't delete" bugs happen.
 */
const updateItems = {
  body: z
    .object({
      items: z
        .array(
          z
            .object({
              itemId: objectId,
              quantity: quantity
                .or(z.literal(0))
                .describe("0 removes the line"),
            })
            .strict()
        )
        .min(1, "At least one item is required")
        .max(CART.MAX_BATCH_SIZE, `A request may carry at most ${CART.MAX_BATCH_SIZE} items`)
        // A batch that names one line twice has no defined outcome - the last
        // write would silently win. Better to say so than to pick one.
        .refine(
          (items) => new Set(items.map((item) => item.itemId)).size === items.length,
          { message: "Each itemId may appear only once" }
        ),
    })
    .strict(),
};

const removeItems = {
  body: z
    .object({
      itemIds: z
        .array(objectId)
        .min(1, "At least one itemId is required")
        .max(CART.MAX_BATCH_SIZE, `A request may carry at most ${CART.MAX_BATCH_SIZE} items`),
    })
    .strict(),
};

module.exports = { addItems, updateItems, removeItems };
