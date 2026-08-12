"use strict";

/**
 * OpenAPI description of the cart. Documentation only.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     CartLine:
 *       type: object
 *       description: >
 *         One row of the cart, priced and checked against the live catalog on
 *         every read. Nothing here is stored on the cart itself except
 *         `quantity` - prices and stock come from the product and variant as
 *         they are right now, so a cart can never quote a price that no longer
 *         exists.
 *       properties:
 *         id:
 *           type: string
 *           description: >
 *             The line id. This is what `PATCH /cart/items` and
 *             `DELETE /cart/items` address - not the product id, since one
 *             product can occupy several lines through different variants.
 *           example: 6733a1b2c3d4e5f6a7b8c9d0
 *         product:
 *           type: object
 *           properties:
 *             id: { type: string, example: 6712f0c2a1b4d3e5f6a7b8c9 }
 *             name: { type: string, example: Nike Sports T-Shirt }
 *             slug: { type: string, example: nike-sports-t-shirt }
 *             thumbnail: { $ref: '#/components/schemas/ProductImage' }
 *             productType: { type: string, enum: [SIMPLE, VARIABLE], example: VARIABLE }
 *         variant:
 *           type: object
 *           nullable: true
 *           description: The chosen SKU. Always null for a SIMPLE product, always present for a VARIABLE one.
 *           properties:
 *             id: { type: string, example: 6712f0c2a1b4d3e5f6a7b8d1 }
 *             sku: { type: string, example: NIKE-TS-BLK-M }
 *             options:
 *               type: object
 *               additionalProperties: { type: string }
 *               example: { color: black, size: m }
 *             label:
 *               type: string
 *               nullable: true
 *               description: The options joined for display, so a row needs no formatting logic.
 *               example: black / m
 *             image: { type: object, nullable: true }
 *         quantity: { type: integer, example: 2 }
 *         currency: { type: string, example: BDT }
 *         unitPrice:
 *           type: number
 *           nullable: true
 *           description: From the variant when there is one, otherwise the product.
 *           example: 1299
 *         originalPrice: { type: number, nullable: true, example: 1499 }
 *         discountPercent: { type: integer, example: 13 }
 *         lineTotal: { type: number, example: 2598 }
 *         originalLineTotal: { type: number, example: 2998 }
 *         availability:
 *           type: object
 *           properties:
 *             purchasable:
 *               type: boolean
 *               description: >
 *                 The single field a checkout should gate on. Already folds in
 *                 product withdrawn, option withdrawn, sold out, and holding
 *                 more units than exist.
 *               example: true
 *             inStock: { type: boolean, example: true }
 *             maxQuantity:
 *               type: integer
 *               nullable: true
 *               description: >
 *                 Units still available for this line. **`null` means no
 *                 ceiling** - inventory is untracked or backorders are on - not
 *                 zero. Use it to bound a quantity stepper.
 *               example: 5
 *         issues:
 *           type: array
 *           description: >
 *             Why the line is not simply buyable, if it is not. Advisory on a
 *             read - a cart whose product was withdrawn overnight still loads,
 *             or the shopper could never remove the offending row.
 *           items:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 enum: [PRODUCT_UNAVAILABLE, VARIANT_UNAVAILABLE, OUT_OF_STOCK, INSUFFICIENT_STOCK, PRICE_CHANGED]
 *                 example: INSUFFICIENT_STOCK
 *               message: { type: string, example: Only 3 left in stock. Reduce the quantity to continue. }
 *         addedAt: { type: string, format: date-time }
 *
 *     CartSummary:
 *       type: object
 *       description: >
 *         Totals. Money counts **purchasable lines only** - a subtotal that
 *         includes a withdrawn product is a figure the shopper cannot pay, and
 *         showing it means the number drops at checkout, the worst moment to
 *         find out. `totalQuantity` counts every line, because that is the
 *         header badge.
 *       properties:
 *         currency: { type: string, example: BDT }
 *         itemCount: { type: integer, description: Distinct lines., example: 3 }
 *         totalQuantity: { type: integer, description: Units across every line., example: 5 }
 *         subtotal: { type: number, example: 6495 }
 *         originalSubtotal: { type: number, example: 7495 }
 *         discount: { type: number, example: 1000 }
 *         unavailableCount: { type: integer, example: 0 }
 *         hasIssues: { type: boolean, example: false }
 *         checkoutReady:
 *           type: boolean
 *           description: The cart has something in it and every line is purchasable.
 *           example: true
 *
 *     Cart:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items: { $ref: '#/components/schemas/CartLine' }
 *         summary: { $ref: '#/components/schemas/CartSummary' }
 *         updatedAt: { type: string, format: date-time, nullable: true }
 *
 *     CartAdjustment:
 *       type: object
 *       description: >
 *         A quantity the server changed. Quantity is the only thing ever
 *         adjusted rather than refused, because "you asked for 10, there are 3"
 *         has an obviously right answer - but it is always reported, so the UI
 *         can tell the shopper instead of quietly showing a smaller number.
 *       properties:
 *         productId: { type: string, example: 6712f0c2a1b4d3e5f6a7b8c9 }
 *         variantId: { type: string, nullable: true, example: 6712f0c2a1b4d3e5f6a7b8d1 }
 *         requested: { type: integer, example: 10 }
 *         applied: { type: integer, example: 3 }
 *         code: { type: string, enum: [QUANTITY_ADJUSTED], example: QUANTITY_ADJUSTED }
 *         message: { type: string, example: Only 3 left in stock, so the quantity was capped. }
 *
 *     CartResponse:
 *       type: object
 *       description: What every cart endpoint returns - the whole cart, never a delta.
 *       properties:
 *         cart: { $ref: '#/components/schemas/Cart' }
 *         adjustments:
 *           type: array
 *           items: { $ref: '#/components/schemas/CartAdjustment' }
 *
 *     CartItemsAdd:
 *       type: object
 *       required: [items]
 *       properties:
 *         items:
 *           type: array
 *           minItems: 1
 *           maxItems: 50
 *           items:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId: { type: string, example: 6712f0c2a1b4d3e5f6a7b8c9 }
 *               variantId:
 *                 type: string
 *                 nullable: true
 *                 description: >
 *                   **Required** for a VARIABLE product and **refused** for a
 *                   SIMPLE one. A variable product is a family of SKUs, not
 *                   something that can be picked and packed, so adding one
 *                   without saying which option leaves the warehouse guessing.
 *                   `null` and omitting it mean the same thing.
 *                 example: 6712f0c2a1b4d3e5f6a7b8d1
 *               quantity: { type: integer, minimum: 1, maximum: 100, default: 1, example: 2 }
 *
 *     CartItemsUpdate:
 *       type: object
 *       required: [items]
 *       properties:
 *         items:
 *           type: array
 *           minItems: 1
 *           maxItems: 50
 *           items:
 *             type: object
 *             required: [itemId, quantity]
 *             properties:
 *               itemId:
 *                 type: string
 *                 description: The cart **line** id from `CartLine.id`, not a product id.
 *                 example: 6733a1b2c3d4e5f6a7b8c9d0
 *               quantity:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *                 description: >
 *                   **0 removes the line.** The stepper next to a cart row
 *                   decrements to zero, and making the client notice that and
 *                   switch endpoints mid-interaction is how "the last one will
 *                   not delete" bugs happen.
 *                 example: 3
 *
 *     CartItemsRemove:
 *       type: object
 *       required: [itemIds]
 *       properties:
 *         itemIds:
 *           type: array
 *           minItems: 1
 *           maxItems: 50
 *           items: { type: string }
 *           example: [6733a1b2c3d4e5f6a7b8c9d0, 6733a1b2c3d4e5f6a7b8c9d1]
 *
 * /cart:
 *   get:
 *     tags: [Cart]
 *     summary: The signed-in shopper's cart
 *     description: >
 *       Returns every line priced and checked against the live catalog. A cart
 *       that has never been used answers 200 with an empty one rather than 404,
 *       and no row is written for a shopper who has only browsed.
 *
 *
 *       **This read never fails on bad catalog state.** A product unpublished
 *       overnight, a variant withdrawn, a line holding more units than remain -
 *       all come back flagged in `issues` with `purchasable: false`, never as
 *       an error. The opposite would lock the shopper out of their own basket
 *       with no way to remove the offending item.
 *     responses:
 *       200:
 *         description: The cart.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/CartResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *   delete:
 *     tags: [Cart]
 *     summary: Empty the cart
 *     description: >
 *       Removes every line in one call. Idempotent - clearing an already-empty
 *       cart succeeds - and answers with the empty cart so the client has the
 *       same shape it gets everywhere else.
 *     responses:
 *       200:
 *         description: The now-empty cart.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/CartResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *
 * /cart/count:
 *   get:
 *     tags: [Cart]
 *     summary: Line and unit counts for the header badge
 *     description: >
 *       The two numbers a header badge needs, and nothing else. Separate from
 *       `GET /cart` because it runs on every page load of the site and has no
 *       business pricing lines or checking stock to answer "3".
 *     responses:
 *       200:
 *         description: Counts.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         itemCount: { type: integer, description: Distinct lines., example: 3 }
 *                         totalQuantity: { type: integer, description: Units across every line., example: 5 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *
 * /cart/items:
 *   post:
 *     tags: [Cart]
 *     summary: Add items in bulk
 *     description: >
 *       Always a batch, including the one-item case - `{ "items": [one] }`. A
 *       separate single-item endpoint would mean two implementations of the
 *       same rules, and the one used less is the one that drifts.
 *
 *
 *       **Merging.** Adding something already in the cart increases that line's
 *       quantity rather than creating a duplicate row. The same product and
 *       variant sent twice in one batch is summed, not rejected, so a retried
 *       request or a double tap does the sensible thing.
 *
 *
 *       **All or nothing.** If any item cannot be added the whole request is
 *       refused with 422 and one entry per offending item, each carrying a
 *       `code` (`PRODUCT_UNAVAILABLE`, `OUT_OF_STOCK`, `VARIANT_REQUIRED`,
 *       `VARIANT_NOT_ALLOWED`, `VARIANT_UNAVAILABLE`,
 *       `VARIANT_PRODUCT_MISMATCH`) and a `field` pointing at the item's
 *       position in the array you sent.
 *
 *
 *       **Quantity is the exception** and is capped rather than refused, to the
 *       lower of remaining stock and 100 per line. Every cap comes back in
 *       `adjustments` - show it, or the shopper silently gets fewer than they
 *       asked for.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CartItemsAdd' }
 *           example:
 *             items:
 *               - productId: 6712f0c2a1b4d3e5f6a7b8c9
 *                 variantId: 6712f0c2a1b4d3e5f6a7b8d1
 *                 quantity: 2
 *               - productId: 6712f0c2a1b4d3e5f6a7b8ca
 *                 quantity: 1
 *     responses:
 *       200:
 *         description: The updated cart, plus any quantity adjustments.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/CartResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409:
 *         description: The cart was written concurrently three times over. Retry.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       422:
 *         description: One or more items could not be added, or the cart is full.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               statusCode: 422
 *               message: Some items could not be added to your cart
 *               code: CART_ITEMS_INVALID
 *               errors:
 *                 - field: items.0.variantId
 *                   code: VARIANT_REQUIRED
 *                   message: Nike Sports T-Shirt has options - choose one before adding it.
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *   patch:
 *     tags: [Cart]
 *     summary: Update quantities in bulk
 *     description: >
 *       Sets absolute quantities - not deltas - for lines addressed by their
 *       `id`. **A quantity of 0 removes the line.**
 *
 *
 *       Deliberately permissive about availability: the quantity of a line
 *       whose product has since been withdrawn can still be changed, because
 *       the alternative is a row the shopper can neither fix nor reduce. What
 *       it will not do is invent a line - an unknown `itemId` refuses the whole
 *       batch with `CART_ITEM_NOT_FOUND`, since silently ignoring it would
 *       leave the screen showing a number the server never accepted.
 *
 *
 *       Quantities are capped to available stock the same way `POST` caps them,
 *       and every cap is reported in `adjustments`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CartItemsUpdate' }
 *           example:
 *             items:
 *               - itemId: 6733a1b2c3d4e5f6a7b8c9d0
 *                 quantity: 3
 *               - itemId: 6733a1b2c3d4e5f6a7b8c9d1
 *                 quantity: 0
 *     responses:
 *       200:
 *         description: The updated cart, plus any quantity adjustments.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/CartResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409:
 *         description: The cart was written concurrently three times over. Retry.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       422:
 *         description: An itemId is not in the cart, or a quantity is out of range.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *   delete:
 *     tags: [Cart]
 *     summary: Remove several lines at once
 *     description: >
 *       Removes every listed line in one call, rather than one request per row
 *       that can half succeed.
 *
 *
 *       **Idempotent.** An id that is already gone is not an error - the only
 *       ways to reach that state are a double-tapped remove and a stale screen,
 *       and both should end with the item gone rather than with a dialog. Those
 *       ids come back in `notFound`, and `removed` counts what actually went.
 *
 *
 *       **Note for clients:** this DELETE carries a JSON body. `fetch` handles
 *       that natively; axios needs `axios.delete(url, { data: { itemIds } })`,
 *       as a plain second argument is treated as config and silently dropped.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CartItemsRemove' }
 *           example:
 *             itemIds: [6733a1b2c3d4e5f6a7b8c9d0, 6733a1b2c3d4e5f6a7b8c9d1]
 *     responses:
 *       200:
 *         description: The updated cart.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       allOf:
 *                         - $ref: '#/components/schemas/CartResponse'
 *                         - type: object
 *                           properties:
 *                             removed: { type: integer, example: 2 }
 *                             notFound:
 *                               type: array
 *                               description: Ids that were not in the cart. Not an error.
 *                               items: { type: string }
 *                               example: []
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
