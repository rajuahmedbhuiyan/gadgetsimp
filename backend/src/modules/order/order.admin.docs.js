"use strict";

/**
 * OpenAPI description of staff order management. Documentation only.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     OrderClientInfo:
 *       type: object
 *       nullable: true
 *       description: >
 *         What the order was placed from. **Evidence, not identity** - every
 *         field is client-supplied or derived from client-supplied text, and
 *         none of it authorises anything. It exists so support can make sense
 *         of a complaint and so a pattern of fraudulent orders has something to
 *         correlate on. The raw user agent is always kept alongside the parsed
 *         values, so a wrong guess costs nothing.
 *       properties:
 *         ip: { type: string, nullable: true, example: 203.0.113.42 }
 *         userAgent: { type: string, nullable: true, example: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36' }
 *         os: { type: string, nullable: true, example: Android }
 *         browser: { type: string, nullable: true, example: Chrome }
 *         device: { type: string, nullable: true, enum: [MOBILE, TABLET, DESKTOP, BOT], example: MOBILE }
 *
 *     AdminOrder:
 *       description: >
 *         Everything the customer shape carries, plus what staff need to work
 *         the queue: who owns it, where it came from, the internal stock
 *         bookkeeping, and who last touched it.
 *       allOf:
 *         - $ref: '#/components/schemas/Order'
 *         - type: object
 *           properties:
 *             userId: { type: integer, nullable: true, description: Null for a guest order., example: 1004 }
 *             client: { $ref: '#/components/schemas/OrderClientInfo' }
 *             stockReleased:
 *               type: boolean
 *               description: Whether the reserved units have already been returned to the catalog. Guards against restocking twice.
 *               example: false
 *             updatedBy: { type: integer, nullable: true, example: 1002 }
 *             deletedAt: { type: string, format: date-time, nullable: true }
 *
 *     AdminOrderFilter:
 *       type: object
 *       properties:
 *         status:
 *           description: One status or several.
 *           oneOf:
 *             - type: string
 *               enum: [PENDING, CONFIRMED, OUT_FOR_DELIVERY, DELIVERED, RETURNED, CANCELED]
 *             - type: array
 *               items:
 *                 type: string
 *                 enum: [PENDING, CONFIRMED, OUT_FOR_DELIVERY, DELIVERED, RETURNED, CANCELED]
 *           example: [PENDING]
 *         paymentMethod: { type: string, enum: [CASH_ON_DELIVERY] }
 *         search:
 *           type: string
 *           description: >
 *             One box, matching order number, customer name, phone or email -
 *             because that is what the person on the phone has: a number the
 *             customer read out, or their name.
 *           example: '482915'
 *         userId: { type: integer, description: Narrow to one customer., example: 1004 }
 *         guestOnly:
 *           type: boolean
 *           description: Only orders with no account behind them - the ones fraud review looks at first.
 *           example: false
 *         minTotal: { type: number, example: 500 }
 *         maxTotal: { type: number, example: 20000 }
 *         placedFrom: { type: string, format: date-time }
 *         placedTo: { type: string, format: date-time }
 *         includeDeleted:
 *           type: boolean
 *           default: false
 *           description: Soft-deleted orders are hidden unless explicitly asked for.
 *         sort:
 *           type: object
 *           properties:
 *             field: { type: string, enum: [placedAt, total, status], default: placedAt }
 *             direction: { type: string, enum: [asc, desc], default: desc }
 *         pagination:
 *           type: object
 *           properties:
 *             page: { type: integer, minimum: 0, default: 0, description: Zero-based., example: 0 }
 *             limit: { type: integer, minimum: 1, maximum: 100, default: 20, example: 20 }
 *
 * /admin/orders/filter:
 *   post:
 *     tags: [Orders Admin]
 *     summary: The staff order queue
 *     description: >
 *       Every order in the system, paginated and zero-based. **MODERATOR and
 *       above** - moderators work this queue, and admins and owners inherit
 *       access rather than being listed separately.
 *
 *
 *       Returns the full staff shape, including the IP and device the order
 *       came from, because the person working this list is deciding whether to
 *       dispatch and hiding half the record just means opening every order one
 *       at a time.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AdminOrderFilter' }
 *           example:
 *             status: [PENDING, CONFIRMED]
 *             search: '482915'
 *             guestOnly: false
 *             minTotal: 500
 *             includeDeleted: false
 *             sort: { field: placedAt, direction: desc }
 *             pagination: { page: 0, limit: 20 }
 *     responses:
 *       200:
 *         description: Paginated orders, full staff shape.
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
 *                           items: { $ref: '#/components/schemas/AdminOrder' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /admin/orders/{id}:
 *   get:
 *     tags: [Orders Admin]
 *     summary: One order, full staff shape
 *     description: MODERATOR and above. Soft-deleted orders are visible here.
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
 *                         order: { $ref: '#/components/schemas/AdminOrder' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Orders Admin]
 *     summary: Correct the delivery details
 *     description: >
 *       MODERATOR and above. Fixes a mistyped house number or a wrong phone -
 *       the routine correction, made daily.
 *
 *
 *       **Nothing about money or state is reachable from here.** There is no
 *       way to edit a price, a line item, a quantity or a total through this
 *       API at all: a moderator able to change what an order costs after the
 *       customer agreed to it is a different system, and one that needs an
 *       approval trail before it exists. Status is its own endpoint.
 *
 *
 *       Address fields **merge** rather than replace, so sending only `city`
 *       fixes the city without wiping the street.
 *
 *
 *       Refused for a DELIVERED, RETURNED or CANCELED order: at that point the
 *       address is the record of where the goods actually went, and editing it
 *       rewrites the evidence rather than fixing anything.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         example: 1000
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Send at least one field.
 *             properties:
 *               contact:
 *                 type: object
 *                 properties:
 *                   name: { type: string, maxLength: 120, example: Rahim Uddin }
 *                   phone: { type: string, example: '+8801712345678' }
 *               shippingAddress:
 *                 type: object
 *                 description: Partial - merged into the existing address.
 *                 properties:
 *                   line1: { type: string, example: 'House 42, Road 3' }
 *                   line2: { type: string }
 *                   area: { type: string }
 *                   city: { type: string, example: Dhaka }
 *                   district: { type: string }
 *                   postalCode: { type: string, example: '1209' }
 *                   country: { type: string, example: Bangladesh }
 *               note:
 *                 type: string
 *                 nullable: true
 *                 maxLength: 1000
 *                 description: The customer's delivery instruction. Send `null` to clear it; omit to leave it alone.
 *                 example: Leave with the security guard
 *           example:
 *             contact: { phone: '+8801799999999' }
 *             shippingAddress: { city: Dhaka, postalCode: '1209' }
 *             note: Leave with the security guard
 *     responses:
 *       200:
 *         description: Updated order.
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
 *                         order: { $ref: '#/components/schemas/AdminOrder' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422:
 *         description: Nothing to update, or the order is finalised (`ORDER_FINALISED`).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   delete:
 *     tags: [Orders Admin]
 *     summary: Soft delete an order
 *     description: >
 *       **ADMIN and above** - one rung higher than the rest of this router. A
 *       moderator works the queue; removing the record of a sale is a different
 *       kind of act.
 *
 *
 *       Hides the order from every listing without destroying it, because an
 *       order is a financial record - what a refund, a tax return and a dispute
 *       are all argued from. Any stock it was still holding is released on the
 *       way out, since units held for an order nobody can see are units
 *       permanently lost from sale.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         example: 1000
 *     responses:
 *       200:
 *         description: The soft-deleted order.
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
 *                         order: { $ref: '#/components/schemas/AdminOrder' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 * /admin/orders/{id}/status:
 *   patch:
 *     tags: [Orders Admin]
 *     summary: Move an order through the workflow
 *     description: >
 *       MODERATOR and above. Three rules, all enforced server-side.
 *
 *
 *       **1. The transition must be legal.** Any status being settable from any
 *       other is not a workflow, it is a corruption that surfaces weeks later
 *       in a report nobody can reconcile. The permitted moves are:
 *
 *
 *       - `PENDING` → CONFIRMED, CANCELED
 *       - `CONFIRMED` → OUT_FOR_DELIVERY, CANCELED
 *       - `OUT_FOR_DELIVERY` → DELIVERED, RETURNED, CANCELED
 *       - `DELIVERED` → RETURNED
 *       - `RETURNED`, `CANCELED` → **terminal**
 *
 *
 *       **2. A bad outcome needs a reason.** `note` is **required** for
 *       RETURNED and CANCELED, optional otherwise. Those are the two statuses
 *       anyone ever looks back at - during a refund dispute, a courier claim,
 *       or an argument about who cancelled - and the bare word answers none of
 *       those questions. The note is recorded against that specific change in
 *       `statusHistory`, alongside who made it and when.
 *
 *
 *       **3. Ending an order releases its stock**, exactly once. Reaching
 *       RETURNED or CANCELED returns the reserved units to the catalog;
 *       `stockReleased` guards against a retry restocking twice and inventing
 *       inventory that never existed.
 *
 *
 *       Reaching DELIVERED also marks the payment PAID, since cash on delivery
 *       is settled by the courier handing it over.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         example: 1000
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, CONFIRMED, OUT_FOR_DELIVERY, DELIVERED, RETURNED, CANCELED]
 *                 example: CANCELED
 *               note:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Required for RETURNED and CANCELED; optional for every other status.
 *                 example: Customer unreachable on three attempts
 *           examples:
 *             confirm:
 *               summary: Confirm - note optional
 *               value: { status: CONFIRMED }
 *             cancel:
 *               summary: Cancel - note required
 *               value: { status: CANCELED, note: Customer unreachable on three attempts }
 *     responses:
 *       200:
 *         description: Updated order.
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
 *                         order: { $ref: '#/components/schemas/AdminOrder' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422:
 *         description: >
 *           Illegal transition (`ORDER_STATUS_TRANSITION_INVALID`), a missing
 *           note on a negative status (`ORDER_STATUS_NOTE_REQUIRED`), or the
 *           order is already in that status (`ORDER_STATUS_UNCHANGED`).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               statusCode: 422
 *               message: A note is required when marking an order CANCELED.
 *               code: ORDER_STATUS_NOTE_REQUIRED
 *               errors:
 *                 - field: note
 *                   code: NOTE_REQUIRED
 *                   message: Explain why this order was canceled.
 *
 * /admin/orders/{id}/permanent:
 *   delete:
 *     tags: [Orders Admin]
 *     summary: Permanently delete an order
 *     description: >
 *       **ADMIN and above, and genuinely irreversible.** Its own path rather
 *       than a flag on the soft delete, because a destructive operation should
 *       be something you ask for by name, not something a stray query
 *       parameter turns on.
 *
 *
 *       Any stock still held is released first, since afterwards there is no
 *       record left to release it from.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         example: 1000
 *     responses:
 *       200:
 *         description: Deleted.
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
 *                         id: { type: integer, example: 1000 }
 *                         orderNumber: { type: string, example: '482915' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
