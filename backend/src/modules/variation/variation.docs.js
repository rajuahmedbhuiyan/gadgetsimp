"use strict";

/**
 * @openapi
 * /variations/generate:
 *   post:
 *     tags: [Variations]
 *     summary: Preview variation combinations without saving them
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [options]
 *             properties:
 *               options: { type: object, additionalProperties: { type: array, items: { type: string } } }
 *               sellingPrice: { type: number, minimum: 0 }
 *               originalPrice: { type: number, minimum: 0 }
 *               stock: { $ref: '#/components/schemas/Stock' }
 *               status: { type: string, enum: [DRAFT, ACTIVE, OUT_OF_STOCK] }
 *               image: { $ref: '#/components/schemas/ProductImage' }
 *           example:
 *             options: { color: [black, white], size: [m, l] }
 *             sellingPrice: 1299
 *             originalPrice: 1499
 *             stock:
 *               quantity: 8
 *               trackInventory: true
 *               allowBackorder: false
 *               lowStockThreshold: 2
 *               status: IN_STOCK
 *             status: ACTIVE
 *             image:
 *               alt: Nike sports t-shirt
 *               src: https://cdn.example.com/products/nike-shirt.webp
 *               id: 1050
 *     responses:
 *       200: { description: Generated combinations with supplied prices, stock, status and image; no database writes. }
 *       422: { $ref: '#/components/responses/ValidationError' }
 * /variations/filter:
 *   post:
 *     tags: [Variations]
 *     summary: Filter and paginate variations
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               productId: { $ref: '#/components/schemas/CatalogId' }
 *               search: { type: string }
 *               status: { type: string, enum: [DRAFT, ACTIVE, OUT_OF_STOCK] }
 *               pagination: { type: object, properties: { page: { type: integer, minimum: 0 }, limit: { type: integer, minimum: 1, maximum: 100 } } }
 *           example: { productId: 66bca1f8d7432e0012345681, search: NIKE, status: ACTIVE, pagination: { page: 0, limit: 50 } }
 *     responses:
 *       200: { description: Variations returned with a minimal productId object. }
 * /variations/{id}:
 *   get:
 *     tags: [Variations]
 *     summary: Get a variation
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { $ref: '#/components/schemas/CatalogId' } }
 *     responses:
 *       200: { description: Variation retrieved. }
 *   patch:
 *     tags: [Variations]
 *     summary: Partially update price, stock, image or other variation data
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { $ref: '#/components/schemas/CatalogId' } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               sku: { type: string }
 *               barcode: { type: string }
 *               sellingPrice: { type: number, minimum: 0 }
 *               originalPrice: { type: number, minimum: 0 }
 *               stock: { $ref: '#/components/schemas/Stock' }
 *               status: { type: string, enum: [DRAFT, ACTIVE, OUT_OF_STOCK] }
 *               image: { $ref: '#/components/schemas/ProductImage' }
 *               sortOrder: { type: integer, minimum: 0 }
 *           example:
 *             sellingPrice: 1299
 *             originalPrice: 1499
 *             stock:
 *               quantity: 8
 *               trackInventory: true
 *               allowBackorder: false
 *               lowStockThreshold: 2
 *               status: IN_STOCK
 *             status: ACTIVE
 *             image:
 *               alt: Black medium t-shirt
 *               src: https://cdn.example.com/products/nike-shirt-black-m.webp
 *               id: 1050
 *     responses:
 *       200: { description: Supplied fields updated; omitted fields preserved. }
 *   delete:
 *     tags: [Variations]
 *     summary: Delete a variation
 *     description: Soft-deletes the variation so it no longer appears in product or variation queries.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { $ref: '#/components/schemas/CatalogId' } }
 *     responses:
 *       200: { description: Variation deleted. }
 *       404: { description: Variation not found. }
 */
