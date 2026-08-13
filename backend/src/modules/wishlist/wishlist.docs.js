"use strict";

/**
 * OpenAPI description of the wishlist. Documentation only.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     WishlistItem:
 *       description: >
 *         A saved product, carrying the same card fields the storefront grid
 *         renders - from the same projection, so a saved item and a browsed
 *         item can never disagree about price or discount - plus when it was
 *         saved and whether it is still available.
 *
 *
 *         `id` is the **product id**, which is also what
 *         `DELETE /wishlist/items` takes. There is no separate wishlist-entry
 *         id to keep track of.
 *       allOf:
 *         - $ref: '#/components/schemas/ShopCard'
 *         - type: object
 *           properties:
 *             addedAt: { type: string, format: date-time }
 *             available:
 *               type: boolean
 *               description: >
 *                 False once the product has been unpublished, hidden or
 *                 deleted. Such a row is still returned - with its other fields
 *                 null if the product is gone entirely - because a row the
 *                 shopper cannot see is a row they can never remove. Use
 *                 `availableOnly: true` to filter them out.
 *               example: true
 *
 *     WishlistCounts:
 *       type: object
 *       properties:
 *         total: { type: integer, description: How many products are saved after this call., example: 12 }
 *
 * /wishlist/filter:
 *   post:
 *     tags: [Wishlist]
 *     summary: The caller's saved products, with live product data
 *     description: >
 *       Paginated and zero-based, newest-saved first by default - which is what
 *       a wishlist is, a list in the order you saved things.
 *
 *
 *       Product data is resolved on every read, never stored, so a saved item
 *       can never show last month's price.
 *
 *
 *       **Filters are a smaller set than `POST /shop` offers, on purpose.**
 *       Category and brand facets are absent: a category on the storefront
 *       expands to its whole subtree, and supporting a flat version here would
 *       mean the same parameter meaning two different things in two endpoints.
 *       Search, price, stock and sort cover what a list of a few dozen saved
 *       products needs.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               search: { type: string, maxLength: 160, description: Matches the product name., example: t-shirt }
 *               price:
 *                 type: object
 *                 description: >
 *                   Filters the **effective** price, so a variable product is
 *                   matched on its variant range rather than a price it does
 *                   not have.
 *                 properties:
 *                   min: { type: number, minimum: 0, example: 500 }
 *                   max: { type: number, minimum: 0, example: 2000 }
 *               inStock:
 *                 type: boolean
 *                 description: >
 *                   Buyable right now. Opt-in, never implied - saved items are
 *                   routinely out of stock, and that is half the reason people
 *                   save them.
 *                 example: true
 *               availableOnly:
 *                 type: boolean
 *                 default: false
 *                 description: Drop entries whose product has been withdrawn. Off by default so they stay removable.
 *                 example: false
 *               sort:
 *                 type: object
 *                 properties:
 *                   field: { type: string, enum: [addedAt, price, name], default: addedAt }
 *                   direction: { type: string, enum: [asc, desc], default: desc }
 *               pagination:
 *                 type: object
 *                 properties:
 *                   page: { type: integer, minimum: 0, default: 0, description: Zero-based., example: 0 }
 *                   limit: { type: integer, minimum: 1, maximum: 100, default: 20, example: 20 }
 *           example:
 *             search: t-shirt
 *             price: { min: 500, max: 2000 }
 *             inStock: true
 *             availableOnly: false
 *             sort: { field: addedAt, direction: desc }
 *             pagination: { page: 0, limit: 20 }
 *     responses:
 *       200:
 *         description: Paginated saved products.
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
 *                         items:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/WishlistItem' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /wishlist/ids:
 *   get:
 *     tags: [Wishlist]
 *     summary: Every saved product id, and nothing else
 *     description: >
 *       The endpoint a storefront grid calls once on load to fill in its heart
 *       icons. Asking the paginated listing for that would ship a hundred
 *       product cards to render a hundred booleans; this is one projected query
 *       against an index with no join to the catalog at all.
 *
 *
 *       Unpaginated on purpose - the list is capped at 200 ids, a few
 *       kilobytes. Newest-saved first.
 *
 *
 *       Returns ids for withdrawn products too, since the heart on a product
 *       page should still read as saved.
 *     responses:
 *       200:
 *         description: The ids.
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
 *                         productIds:
 *                           type: array
 *                           items: { type: string }
 *                           example: [6712f0c2a1b4d3e5f6a7b8c9, 6712f0c2a1b4d3e5f6a7b8ca]
 *                         total: { type: integer, example: 2 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *
 * /wishlist/items:
 *   post:
 *     tags: [Wishlist]
 *     summary: Save products
 *     description: >
 *       Takes a batch, including the one-item case. **Idempotent** - re-saving
 *       something already on the list is not an error, because a client
 *       rendering hearts from a cached id list will legitimately send one that
 *       is already saved. The response separates `added` from `alreadySaved`.
 *
 *
 *       **No `variantId`, anywhere in this module.** A wishlist records "I want
 *       this thing"; which size or colour is a decision made at the point of
 *       buying, and storing one would mean a saved item vanishing when that
 *       particular SKU was discontinued even though the product is still on
 *       sale.
 *
 *
 *       An unavailable product refuses the whole batch with 422, naming each
 *       offending position. Note that **out of stock is not a reason to
 *       refuse** - saving something precisely because it is unavailable today
 *       is half the point of a wishlist - so the gate here is visibility only,
 *       where the cart's is visibility and stock.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productIds]
 *             properties:
 *               productIds:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 50
 *                 items: { type: string }
 *                 example: [6712f0c2a1b4d3e5f6a7b8c9, 6712f0c2a1b4d3e5f6a7b8ca]
 *           example:
 *             productIds: [6712f0c2a1b4d3e5f6a7b8c9, 6712f0c2a1b4d3e5f6a7b8ca]
 *     responses:
 *       200:
 *         description: Saved.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       allOf:
 *                         - $ref: '#/components/schemas/WishlistCounts'
 *                         - type: object
 *                           properties:
 *                             added:
 *                               type: array
 *                               items: { type: string }
 *                               description: Newly saved.
 *                             alreadySaved:
 *                               type: array
 *                               items: { type: string }
 *                               description: Were already on the list. Not an error.
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422:
 *         description: A product is unavailable (`WISHLIST_ITEMS_INVALID`), or the list is full (`WISHLIST_FULL`).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   delete:
 *     tags: [Wishlist]
 *     summary: Remove saved products
 *     description: >
 *       Batch remove, by **product id** - there is no separate entry id to keep
 *       track of.
 *
 *
 *       **Idempotent**: an id that is not on the list is not an error, since
 *       the only ways to reach that state are a double tap and a stale screen,
 *       and both should end with the item gone. Works for withdrawn products
 *       too, which is what keeps an unavailable row removable.
 *
 *
 *       **Note for clients:** this DELETE carries a JSON body. `fetch` handles
 *       that natively; axios needs `axios.delete(url, { data: { productIds } })`,
 *       as a plain second argument is treated as config and silently dropped.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productIds]
 *             properties:
 *               productIds:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 50
 *                 items: { type: string }
 *           example:
 *             productIds: [6712f0c2a1b4d3e5f6a7b8c9]
 *     responses:
 *       200:
 *         description: Removed.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       allOf:
 *                         - $ref: '#/components/schemas/WishlistCounts'
 *                         - type: object
 *                           properties:
 *                             removed: { type: integer, description: How many rows actually went., example: 1 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /wishlist/toggle:
 *   post:
 *     tags: [Wishlist]
 *     summary: Toggle one product - the heart icon
 *     description: >
 *       Saved becomes unsaved, unsaved becomes saved. **The caller does not say
 *       which way**, and that is the point: the button is usually rendered from
 *       an id list that may be seconds stale, so a client asserting "add"
 *       against a list that already has it would be wrong. Letting the server
 *       decide from current state makes a double tap self-correcting.
 *
 *
 *       Answers with the resulting state, so the icon can be set from the
 *       response rather than guessed.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId: { type: string, example: 6712f0c2a1b4d3e5f6a7b8c9 }
 *           example:
 *             productId: 6712f0c2a1b4d3e5f6a7b8c9
 *     responses:
 *       200:
 *         description: The resulting state.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       allOf:
 *                         - $ref: '#/components/schemas/WishlistCounts'
 *                         - type: object
 *                           properties:
 *                             productId: { type: string, example: 6712f0c2a1b4d3e5f6a7b8c9 }
 *                             inWishlist:
 *                               type: boolean
 *                               description: True if it is now saved, false if this call removed it.
 *                               example: true
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422:
 *         description: The product is unavailable, or the list is full.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /wishlist:
 *   delete:
 *     tags: [Wishlist]
 *     summary: Remove everything
 *     description: Idempotent - clearing an already-empty wishlist succeeds.
 *     responses:
 *       200:
 *         description: Cleared.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       allOf:
 *                         - $ref: '#/components/schemas/WishlistCounts'
 *                         - type: object
 *                           properties:
 *                             removed: { type: integer, example: 12 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
