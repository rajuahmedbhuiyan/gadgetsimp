"use strict";

/**
 * OpenAPI description of the product routes. Documentation only.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     ProductImage:
 *       type: object
 *       properties:
 *         url: { type: string, format: uri }
 *         alt: { type: string, example: Front view }
 *
 *     ProductVariant:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         sku: { type: string, example: MBA-M3-256-MID }
 *         attributes:
 *           type: object
 *           additionalProperties: { type: string }
 *           example: { Colour: Midnight, Storage: 256GB }
 *         price: { type: integer, description: Minor units (poisha), example: 16999900 }
 *         compareAtPrice: { type: integer, nullable: true }
 *         stock: { type: integer, example: 12 }
 *         imageUrl: { type: string, nullable: true }
 *         isActive: { type: boolean }
 *
 *     Product:
 *       type: object
 *       properties:
 *         id: { type: string, example: 6712f0c2a1b4d3e5f6a7b8c9 }
 *         title: { type: string, example: MacBook Air M3 13-inch }
 *         slug: { type: string, example: macbook-air-m3-13-inch }
 *         summary: { type: string }
 *         description: { type: string }
 *         brand: { type: string, example: Apple }
 *         category:
 *           type: object
 *           properties:
 *             id: { type: string }
 *             name: { type: string, example: Laptops }
 *             slug: { type: string, example: laptops }
 *             path: { type: string, example: /electronics/laptops }
 *         price:
 *           type: integer
 *           description: >
 *             Minor units (poisha). 169999.00 BDT is `16999900`. Integers are
 *             used throughout because float arithmetic loses precision once
 *             line totals and percentage discounts are applied.
 *           example: 16999900
 *         compareAtPrice: { type: integer, nullable: true, example: 18999900 }
 *         discountPercent: { type: integer, readOnly: true, example: 11 }
 *         currency: { type: string, example: BDT }
 *         stock: { type: integer, example: 24 }
 *         totalStock:
 *           type: integer
 *           readOnly: true
 *           description: Sum across active variants, or `stock` for a simple product.
 *         inStock: { type: boolean, readOnly: true }
 *         isLowStock: { type: boolean, readOnly: true }
 *         sku: { type: string, nullable: true }
 *         images:
 *           type: array
 *           items: { $ref: '#/components/schemas/ProductImage' }
 *         variants:
 *           type: array
 *           items: { $ref: '#/components/schemas/ProductVariant' }
 *         attributes:
 *           type: object
 *           additionalProperties: { type: string }
 *         tags:
 *           type: array
 *           items: { type: string }
 *         status: { type: string, enum: [draft, active, archived] }
 *         isFeatured: { type: boolean }
 *         ratingAverage: { type: number, readOnly: true, example: 4.6 }
 *         ratingCount: { type: integer, readOnly: true, example: 128 }
 *         soldCount: { type: integer, readOnly: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: Browse and search the catalog
 *     description: >
 *       Public listing with filtering, full-text search and pagination.
 *
 *
 *       Non-admin callers only ever see `active` products - passing
 *       `status=draft` does not reveal unreleased items.
 *
 *
 *       Filtering by `category` includes the entire subtree, so
 *       `?category=electronics` also returns products filed under
 *       `Electronics > Laptops > Gaming`. The value accepts an id or a slug.
 *
 *
 *       Requests carrying `search` are additionally metered by the stricter
 *       search tier (30/min) because they hit a text index.
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [-createdAt, price, -price, -ratingAverage, -soldCount, title]
 *         description: Ignored when `search` is present - those results are ordered by relevance.
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *         description: Category id or slug. Includes descendants.
 *         example: laptops
 *       - in: query
 *         name: brand
 *         schema: { type: string }
 *         example: Apple
 *       - in: query
 *         name: tags
 *         schema: { type: string }
 *         description: Comma-separated; matches any.
 *         example: gaming,ultrabook
 *       - in: query
 *         name: minPrice
 *         schema: { type: integer }
 *         description: Minor units (poisha).
 *         example: 5000000
 *       - in: query
 *         name: maxPrice
 *         schema: { type: integer }
 *         example: 20000000
 *       - in: query
 *         name: inStock
 *         schema: { type: string, enum: ['true', 'false'] }
 *       - in: query
 *         name: isFeatured
 *         schema: { type: string, enum: ['true', 'false'] }
 *       - in: query
 *         name: minRating
 *         schema: { type: number, minimum: 0, maximum: 5 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, active, archived] }
 *         description: Admin only; ignored for other callers.
 *     responses:
 *       200:
 *         description: Paginated products.
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
 *                         products:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/Product' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *   post:
 *     tags: [Products]
 *     summary: Create a product (admin)
 *     description: >
 *       Prices are integer minor units. Read-only fields (`ratingAverage`,
 *       `ratingCount`, `soldCount`, `slug`) are rejected if sent - the slug is
 *       derived from the title, and the rest are computed from real events.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, category, price]
 *             properties:
 *               title: { type: string, example: MacBook Air M3 13-inch }
 *               description: { type: string }
 *               summary: { type: string }
 *               brand: { type: string, example: Apple }
 *               category: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
 *               price: { type: integer, example: 16999900 }
 *               compareAtPrice: { type: integer, nullable: true, example: 18999900 }
 *               stock: { type: integer, default: 0, example: 24 }
 *               lowStockThreshold: { type: integer, default: 5 }
 *               sku: { type: string, example: MBA-M3-13 }
 *               images:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/ProductImage' }
 *               variants:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/ProductVariant' }
 *               attributes:
 *                 type: object
 *                 additionalProperties: { type: string }
 *               tags:
 *                 type: array
 *                 items: { type: string }
 *               status: { type: string, enum: [draft, active, archived], default: draft }
 *               isFeatured: { type: boolean, default: false }
 *     responses:
 *       201:
 *         description: Product created.
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
 *                         product: { $ref: '#/components/schemas/Product' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /products/{slug}:
 *   get:
 *     tags: [Products]
 *     summary: Get one product by slug
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *         example: macbook-air-m3-13-inch
 *     responses:
 *       200:
 *         description: Product.
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
 *                         product: { $ref: '#/components/schemas/Product' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 * /products/{id}:
 *   patch:
 *     tags: [Products]
 *     summary: Update a product (admin)
 *     parameters:
 *       - $ref: '#/components/parameters/ObjectIdPath'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *     responses:
 *       200:
 *         description: Product updated.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   delete:
 *     tags: [Products]
 *     summary: Archive a product (admin)
 *     description: >
 *       Sets `status` to `archived` rather than deleting the row. Order
 *       history references products, so a hard delete would break past
 *       orders and invoices.
 *     parameters:
 *       - $ref: '#/components/parameters/ObjectIdPath'
 *     responses:
 *       200:
 *         description: Product archived.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 * /products/{id}/stock:
 *   post:
 *     tags: [Products]
 *     summary: Adjust stock by a signed delta (admin)
 *     description: >
 *       Takes a delta, not an absolute figure, and applies it with a
 *       conditional `$inc` so the database itself refuses to let stock go
 *       negative. Two admins receiving inventory at the same moment therefore
 *       cannot overwrite one another, and concurrent decrements cannot
 *       oversell the last unit.
 *     parameters:
 *       - $ref: '#/components/parameters/ObjectIdPath'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [delta]
 *             properties:
 *               delta: { type: integer, example: -3, description: Positive to restock, negative to consume. }
 *               variantSku: { type: string, example: MBA-M3-256-MID }
 *               reason: { type: string, example: Stock take correction }
 *     responses:
 *       200:
 *         description: Stock adjusted.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409:
 *         description: Adjustment would drive stock below zero.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               statusCode: 409
 *               message: Insufficient stock
 *               code: INSUFFICIENT_STOCK
 *               errors: []
 */
