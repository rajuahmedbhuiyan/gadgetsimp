"use strict";

/**
 * OpenAPI description of checkout and a customer's own orders.
 * Documentation only.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     OrderAddress:
 *       type: object
 *       required: [line1, city]
 *       description: >
 *         Structured rather than one free-text blob, because a courier
 *         integration needs the city and postcode as fields and splitting a
 *         blob apart later is guesswork. `line1` and `city` are the minimum a
 *         courier can act on; the rest are optional because addresses outside a
 *         dense city often genuinely have no postcode, and demanding one only
 *         teaches people to type "n/a".
 *       properties:
 *         line1: { type: string, maxLength: 240, example: 'House 42, Road 3, Dhanmondi' }
 *         line2: { type: string, maxLength: 240, example: Flat B4 }
 *         area: { type: string, maxLength: 120, example: Dhanmondi }
 *         city: { type: string, maxLength: 120, example: Dhaka }
 *         district:
 *           type: string
 *           maxLength: 120
 *           description: >
 *             **Sets the delivery charge.** `Dhaka` is 70, anywhere else is
 *             130, and both are waived once the subtotal reaches 5000. Still
 *             optional - when it is omitted the zone is read from `city`
 *             instead, so a customer who typed only "Dhaka" is charged the
 *             inside-Dhaka rate. Matched case-insensitively.
 *           example: Dhaka
 *         postalCode: { type: string, maxLength: 24, example: '1209' }
 *         country: { type: string, maxLength: 80, default: Bangladesh, example: Bangladesh }
 *
 *     OrderItem:
 *       type: object
 *       description: >
 *         A **frozen copy** of what was bought, not a reference to it. The cart
 *         does the opposite and re-reads prices on every request; an order must
 *         say what was actually agreed, so if the product's price changes
 *         tomorrow this does not. `productId` and `variantId` survive only as
 *         links for reordering and reporting - never as a source of price.
 *       properties:
 *         id: { type: string, example: 6733a1b2c3d4e5f6a7b8c9d0 }
 *         productId: { type: string, example: 6712f0c2a1b4d3e5f6a7b8c9 }
 *         variantId: { type: string, nullable: true, example: 6712f0c2a1b4d3e5f6a7b8d1 }
 *         name: { type: string, example: Nike Sports T-Shirt }
 *         slug: { type: string, nullable: true, example: nike-sports-t-shirt }
 *         sku: { type: string, nullable: true, example: NIKE-TS-BLK-M }
 *         thumbnail: { type: string, nullable: true, example: 'https://cdn.example.com/shirt.webp' }
 *         variantOptions:
 *           type: object
 *           nullable: true
 *           additionalProperties: { type: string }
 *           example: { color: black, size: m }
 *         variantLabel: { type: string, nullable: true, example: black / m }
 *         unitPrice: { type: number, example: 1299 }
 *         originalPrice: { type: number, nullable: true, example: 1499 }
 *         quantity: { type: integer, example: 2 }
 *         lineTotal: { type: number, example: 2598 }
 *
 *     OrderStatusEvent:
 *       type: object
 *       description: >
 *         Appended, never rewritten. The current status answers "where is it
 *         now"; this answers the questions actually asked later - who cancelled
 *         this, when, and what did they say about it.
 *       properties:
 *         status: { type: string, enum: [PENDING, CONFIRMED, OUT_FOR_DELIVERY, DELIVERED, RETURNED, CANCELED] }
 *         note: { type: string, nullable: true, example: Customer unreachable on three attempts }
 *         changedBy: { type: integer, nullable: true, description: User id of the staff member., example: 1004 }
 *         changedAt: { type: string, format: date-time }
 *
 *     Order:
 *       type: object
 *       description: The customer-facing order shape.
 *       properties:
 *         id: { type: integer, description: Internal order id., example: 1000 }
 *         orderNumber:
 *           type: string
 *           description: >
 *             The six-digit number a customer quotes on the phone. Random
 *             rather than sequential, so it is not a public counter of how many
 *             orders the business has taken. Guessable by design, and therefore
 *             authorises nothing - every read is scoped by owner or staff role.
 *           example: '482915'
 *         status: { type: string, enum: [PENDING, CONFIRMED, OUT_FOR_DELIVERY, DELIVERED, RETURNED, CANCELED], example: PENDING }
 *         paymentMethod: { type: string, enum: [CASH_ON_DELIVERY], example: CASH_ON_DELIVERY }
 *         paymentStatus:
 *           type: string
 *           enum: [DUE, PAID, REFUNDED]
 *           description: Cash on delivery is settled when the courier hands it over, so this becomes PAID on DELIVERED.
 *           example: DUE
 *         currency: { type: string, example: BDT }
 *         subtotal: { type: number, description: Sum of line totals at the prices charged., example: 2598 }
 *         discount: { type: number, description: Savings against the struck-through prices. Reported, not deducted - unitPrice is already the price charged., example: 400 }
 *         shippingFee:
 *           type: number
 *           description: >
 *             Delivery charge, decided server-side from the shipping address
 *             and the subtotal: 70 inside Dhaka, 130 elsewhere, 0 once the
 *             subtotal reaches 5000. Frozen onto the order at placement - a
 *             later address correction by staff does not reprice it.
 *           example: 70
 *         total: { type: number, description: subtotal + shippingFee., example: 2668 }
 *         itemCount: { type: integer, example: 2 }
 *         totalQuantity: { type: integer, example: 3 }
 *         items:
 *           type: array
 *           items: { $ref: '#/components/schemas/OrderItem' }
 *         contact:
 *           type: object
 *           properties:
 *             name: { type: string, example: Rahim Uddin }
 *             phone: { type: string, example: '+8801712345678' }
 *         email: { type: string, nullable: true, example: rahim@example.com }
 *         shippingAddress: { $ref: '#/components/schemas/OrderAddress' }
 *         note: { type: string, nullable: true, example: Please call before delivery }
 *         isGuestOrder: { type: boolean, example: false }
 *         statusHistory:
 *           type: array
 *           items: { $ref: '#/components/schemas/OrderStatusEvent' }
 *         placedAt: { type: string, format: date-time }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     OrderPlaceRequest:
 *       type: object
 *       required: [items, contact, shippingAddress]
 *       description: >
 *         **Note what is absent: every price field.** `unitPrice`, `subtotal`,
 *         `total`, `discount`, `shippingFee`, `status` and `orderNumber` are
 *         not accepted, and because this schema is strict, sending one is a
 *         **422 rather than a silently ignored key**. The client chooses what
 *         and how many; the server decides what it costs, resolving every
 *         figure from the catalog at the moment of placement.
 *       properties:
 *         items:
 *           type: array
 *           minItems: 1
 *           maxItems: 50
 *           items:
 *             type: object
 *             required: [productId, quantity]
 *             properties:
 *               productId: { type: string, example: 6712f0c2a1b4d3e5f6a7b8c9 }
 *               variantId:
 *                 type: string
 *                 nullable: true
 *                 description: >
 *                   **Required** for a VARIABLE product and **refused** for a
 *                   SIMPLE one - the same rule the cart applies, from the same
 *                   code, so anything addable to a cart is orderable.
 *                 example: 6712f0c2a1b4d3e5f6a7b8d1
 *               quantity: { type: integer, minimum: 1, maximum: 100, example: 2 }
 *         contact:
 *           type: object
 *           required: [name, phone]
 *           description: Both required - a cash-on-delivery order that cannot be phoned cannot be delivered.
 *           properties:
 *             name: { type: string, maxLength: 120, example: Rahim Uddin }
 *             phone: { type: string, example: '+8801712345678' }
 *         shippingAddress: { $ref: '#/components/schemas/OrderAddress' }
 *         note:
 *           type: string
 *           maxLength: 1000
 *           description: Optional delivery instruction from the customer.
 *           example: Please call before delivery
 *         paymentMethod:
 *           type: string
 *           enum: [CASH_ON_DELIVERY]
 *           default: CASH_ON_DELIVERY
 *           description: One option today. Present as an enum so a second method does not require a client change.
 *         createAccount:
 *           type: boolean
 *           default: false
 *           description: >
 *             Guest checkout only. Offers to turn this purchase into an
 *             account. The order is placed either way - see the endpoint
 *             description for the full flow. Requires `email`, and is ignored
 *             for a signed-in caller.
 *           example: true
 *         email:
 *           type: string
 *           format: email
 *           description: Where the receipt goes. **Required when `createAccount` is true**, since there would otherwise be nothing to verify.
 *           example: rahim@example.com
 *         idempotencyKey:
 *           type: string
 *           minLength: 8
 *           maxLength: 120
 *           description: >
 *             Optional double-submit guard. Send the same key with a retried
 *             request and the original order comes back (200,
 *             `code: ORDER_ALREADY_PLACED`) instead of a second one. Worth
 *             using: a double-tapped "Place order" on a flaky mobile
 *             connection is the normal way duplicate cash-on-delivery orders
 *             get created, and the customer only finds out when two couriers
 *             arrive.
 *
 *
 *             Scoped server-side to the caller - the account if signed in, else
 *             the `email`, else the IP - so keys cannot collide between people
 *             and one shopper's key can never return another's order. The
 *             practical consequence for a client: **retry the identical body**.
 *             A retry that drops `email`, or arrives on a session the first
 *             attempt did not have, lands in a different scope and places a
 *             second order.
 *           example: 8f14e45f-ceea-467a-9c1e-1b2c3d4e5f60
 *
 *     AccountInvite:
 *       type: object
 *       nullable: true
 *       description: >
 *         Present only when a guest asked for an account. Never affects whether
 *         the order was placed - the order is already written by the time this
 *         is attempted, so a mail outage reports itself here rather than
 *         failing a completed purchase.
 *       properties:
 *         status:
 *           type: string
 *           enum: [VERIFICATION_SENT, ACCOUNT_EXISTS, INVITATION_FAILED]
 *           description: >
 *             `VERIFICATION_SENT` - show "check your inbox".
 *             `ACCOUNT_EXISTS` - show "you already have an account, sign in".
 *             `INVITATION_FAILED` - the order stands; the email did not send.
 *           example: VERIFICATION_SENT
 *         email: { type: string, example: rahim@example.com }
 *
 * /orders:
 *   post:
 *     tags: [Orders]
 *     summary: Place an order
 *     description: >
 *       Works **signed in or as a guest** - a shopper should not have to create
 *       an account to buy something. A bearer token is used when present and
 *       links the order to that account; without one the order is a guest
 *       order, identified by the contact details on it.
 *
 *
 *       **Pricing is entirely server-side.** No price field is accepted
 *       anywhere in the request body, and the schema is strict, so sending one
 *       is rejected rather than ignored. Unit prices come from the product or
 *       variant, and the subtotal, discount and total are computed here and
 *       written onto the order as a frozen record.
 *
 *
 *       **Delivery charge**, likewise decided here and not accepted from the
 *       client: **70** when the shipping address's `district` is Dhaka,
 *       **130** anywhere else, and **free** once the subtotal reaches
 *       **5000** - a threshold on the order's value, so five items at 1,000
 *       qualify exactly as one item at 5,000 does. `district` is optional and
 *       falls back to `city`, so "Dhaka" in either field gets the inside rate.
 *
 *
 *       **Stock is reserved as the order is placed**, atomically per line. If
 *       any line cannot be satisfied the whole order is refused with 422 and
 *       nothing is reserved - an order is a commitment, so a quantity that
 *       cannot be met is the wrong order rather than something to quietly
 *       reduce. Reserved units are returned to the catalog if the order is
 *       later CANCELED or RETURNED.
 *
 *
 *       **Guest account creation.** With `createAccount: true` and an `email`,
 *       a verification message is sent after the order is placed. The flow
 *       from there is deliberately two-step:
 *
 *
 *       1. The customer clicks the emailed link; the frontend posts the token
 *          to `POST /auth/verify-email`.
 *       2. That responds **200 with `code: "REQUIRED_PASSWORD"`** and a
 *          `registrationToken` - and **no session**, because a link that
 *          arrived by email is not proof of anything but mailbox access.
 *       3. The frontend opens a password modal and posts the password plus
 *          that token to `POST /auth/complete-registration`, which creates the
 *          account, signs them in, and attaches the order that started all
 *          this to it. No second verification email.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/OrderPlaceRequest' }
 *           example:
 *             items:
 *               - productId: 6712f0c2a1b4d3e5f6a7b8c9
 *                 variantId: 6712f0c2a1b4d3e5f6a7b8d1
 *                 quantity: 2
 *               - productId: 6712f0c2a1b4d3e5f6a7b8ca
 *                 quantity: 1
 *             contact: { name: Rahim Uddin, phone: '+8801712345678' }
 *             shippingAddress:
 *               line1: House 42, Road 3, Dhanmondi
 *               area: Dhanmondi
 *               city: Dhaka
 *               district: Dhaka
 *               postalCode: '1209'
 *               country: Bangladesh
 *             note: Please call before delivery
 *             paymentMethod: CASH_ON_DELIVERY
 *             createAccount: true
 *             email: rahim@example.com
 *             idempotencyKey: 8f14e45f-ceea-467a-9c1e-1b2c3d4e5f60
 *     responses:
 *       201:
 *         description: Order placed.
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
 *                         order: { $ref: '#/components/schemas/Order' }
 *                         accountInvite: { $ref: '#/components/schemas/AccountInvite' }
 *       200:
 *         description: >
 *           A retried `idempotencyKey` - the original order, not a second one.
 *           Carries `code` of `ORDER_ALREADY_PLACED`.
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
 *                         order: { $ref: '#/components/schemas/Order' }
 *       422:
 *         description: >
 *           An item is unavailable, out of stock, missing a required variant,
 *           or a price field was sent. Each entry names the offending item's
 *           position and a `code`.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               statusCode: 422
 *               message: Your order could not be placed
 *               code: ORDER_ITEMS_INVALID
 *               errors:
 *                 - field: items.1.quantity
 *                   code: INSUFFICIENT_STOCK
 *                   message: Only 3 of Nike Sports T-Shirt remain.
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *
 * /orders/filter:
 *   post:
 *     tags: [Orders]
 *     summary: The signed-in customer's own orders
 *     description: >
 *       Paginated, zero-based. There is **no `userId` field**, and that is not
 *       an oversight - the owner comes from the verified token, and accepting
 *       one would invite the belief that it does something.
 *
 *
 *       A guest order appears here only once its email has been verified
 *       through the account-creation flow, which is what attaches it to an
 *       account.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 description: One status or several.
 *                 oneOf:
 *                   - type: string
 *                     enum: [PENDING, CONFIRMED, OUT_FOR_DELIVERY, DELIVERED, RETURNED, CANCELED]
 *                   - type: array
 *                     items:
 *                       type: string
 *                       enum: [PENDING, CONFIRMED, OUT_FOR_DELIVERY, DELIVERED, RETURNED, CANCELED]
 *                 example: [PENDING, CONFIRMED]
 *               placedFrom: { type: string, format: date-time }
 *               placedTo: { type: string, format: date-time }
 *               sort:
 *                 type: object
 *                 properties:
 *                   field: { type: string, enum: [placedAt, total, status], default: placedAt }
 *                   direction: { type: string, enum: [asc, desc], default: desc }
 *               pagination:
 *                 type: object
 *                 properties:
 *                   page: { type: integer, minimum: 0, default: 0, description: Zero-based., example: 0 }
 *                   limit: { type: integer, minimum: 1, maximum: 100, default: 20, example: 20 }
 *           example:
 *             status: [PENDING, CONFIRMED]
 *             sort: { field: placedAt, direction: desc }
 *             pagination: { page: 0, limit: 20 }
 *     responses:
 *       200:
 *         description: Paginated orders.
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
 *                         orders:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/Order' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: One of the customer's own orders
 *     description: >
 *       Scoped to the caller inside the query rather than fetched and then
 *       checked, so there is no window in which someone else's order exists in
 *       a variable.
 *
 *
 *       Answers **404, not 403**, for an order belonging to someone else -
 *       "this order exists but is not yours" is itself information, and order
 *       ids are sequential.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         example: 1000
 *     responses:
 *       200:
 *         description: The order.
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
 *                         order: { $ref: '#/components/schemas/Order' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
