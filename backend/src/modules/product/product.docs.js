"use strict";

/**
 * @openapi
 * components:
 *   schemas:
 *     ProductWrite:
 *       type: object
 *       required: [name, slug, description, categoryId, sellingPrice, thumbnail]
 *       properties:
 *         name: { type: string, example: Nike Sports T-Shirt }
 *         slug: { type: string, example: nike-sports-t-shirt }
 *         description: { type: string, example: Breathable performance t-shirt for everyday training. }
 *         shortDescription: { type: string, example: Lightweight performance t-shirt. }
 *         categoryId: { $ref: '#/components/schemas/CatalogId' }
 *         brandId: { $ref: '#/components/schemas/CatalogId' }
 *         productType: { type: string, enum: [SIMPLE, VARIABLE], example: VARIABLE }
 *         sku: { type: string, example: NIKE-SPORTS }
 *         currency: { type: string, enum: [BDT], default: BDT, example: BDT }
 *         sellingPrice: { type: number, minimum: 0, example: 1299 }
 *         originalPrice: { type: number, minimum: 0, example: 1499 }
 *         stock: { $ref: '#/components/schemas/Stock' }
 *         status: { type: string, enum: [DRAFT, ACTIVE, OUT_OF_STOCK], example: ACTIVE }
 *         visibility: { type: string, enum: [PUBLIC, HIDDEN], example: PUBLIC }
 *         featured: { type: boolean, example: true }
 *         tags: { type: array, items: { type: string }, example: [sportswear, training] }
 *         attributes: { type: object, additionalProperties: true, example: { material: cotton, fit: regular } }
 *         shipping:
 *           type: object
 *           properties:
 *             requiresShipping: { type: boolean, example: true }
 *             freeShipping: { type: boolean, example: false }
 *             weight: { $ref: '#/components/schemas/Weight' }
 *             dimensions: { $ref: '#/components/schemas/Dimensions' }
 *         thumbnail: { $ref: '#/components/schemas/ProductImage' }
 *         images:
 *           type: array
 *           items: { $ref: '#/components/schemas/ProductImage' }
 *           example:
 *             - { alt: Front view, src: https://cdn.example.com/products/nike-shirt-front.webp, id: 1043 }
 *             - { alt: Back view, src: https://cdn.example.com/products/nike-shirt-back.webp }
 *         seo:
 *           allOf: [{ $ref: '#/components/schemas/CatalogSeo' }]
 *           description: Optional. Missing SEO fields are derived from product name, descriptions, slug, thumbnail and tags.
 *         publishedAt: { type: string, format: date-time, nullable: true }
 *     ProductCreate:
 *       allOf:
 *         - $ref: '#/components/schemas/ProductWrite'
 *         - type: object
 *           properties:
 *             variationOptions:
 *               type: object
 *               description: Required for VARIABLE products. Variations are persisted only during POST /products.
 *               additionalProperties: { type: array, items: { type: string } }
 *               example: { color: [black, white], size: [m, l] }
 *     ProductFilterRequest:
 *       type: object
 *       properties:
 *         categoryId: { $ref: '#/components/schemas/CatalogId' }
 *         filters: { type: object, additionalProperties: true }
 *         search: { type: string, example: sports t-shirt }
 *         sort:
 *           type: object
 *           properties:
 *             field: { type: string, enum: [relevance, price, name, createdAt], example: price }
 *             direction: { type: string, enum: [asc, desc], example: asc }
 *         pagination:
 *           type: object
 *           properties:
 *             page: { type: integer, minimum: 0, example: 0 }
 *             limit: { type: integer, minimum: 1, maximum: 100, example: 24 }
 *
 * /products:
 *   post:
 *     tags: [Products]
 *     summary: Create a product
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ProductCreate' }
 *           example:
 *             name: Nike Sports T-Shirt
 *             slug: nike-sports-t-shirt
 *             description: Breathable performance t-shirt for everyday training.
 *             shortDescription: Lightweight performance t-shirt.
 *             categoryId: 66bca1f8d7432e0012345678
 *             brandId: 66bca1f8d7432e0012345679
 *             productType: VARIABLE
 *             sku: NIKE-SPORTS
 *             currency: BDT
 *             sellingPrice: 1299
 *             originalPrice: 1499
 *             stock: { quantity: 20, trackInventory: true, allowBackorder: false, lowStockThreshold: 5, status: IN_STOCK }
 *             status: ACTIVE
 *             visibility: PUBLIC
 *             featured: true
 *             tags: [sportswear, training]
 *             attributes: { material: cotton, fit: regular }
 *             variationOptions: { color: [black, white], size: [m, l] }
 *             shipping:
 *               requiresShipping: true
 *               freeShipping: false
 *               weight: { value: 0.25, unit: kg }
 *               dimensions: { length: 30, width: 24, height: 3, unit: cm }
 *             thumbnail: { alt: Black Nike sports t-shirt, src: https://cdn.example.com/products/nike-shirt.webp, id: 1042 }
 *             images:
 *               - { alt: Front view, src: https://cdn.example.com/products/nike-shirt-front.webp, id: 1043 }
 *               - { alt: Back view, src: https://cdn.example.com/products/nike-shirt-back.webp }
 *             seo: { title: Nike Sports T-Shirt | Buy Online }
 *             publishedAt: '2026-08-13T09:00:00.000Z'
 *     responses:
 *       201: { description: Product created. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 * /products/filter:
 *   post:
 *     tags: [Products]
 *     summary: Filter public products
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ProductFilterRequest' }
 *           example:
 *             categoryId: 66bca1f8d7432e0012345678
 *             filters: { brand: [66bca1f8d7432e0012345679], color: [black], size: [m] }
 *             search: sports t-shirt
 *             sort: { field: price, direction: asc }
 *             pagination: { page: 0, limit: 24 }
 *     responses:
 *       200: { description: Paginated products with minimal categoryId and brandId objects. }
 * /products/filter-options:
 *   post:
 *     tags: [Products]
 *     summary: Get product filter options and counts
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [categoryId], properties: { categoryId: { $ref: '#/components/schemas/CatalogId' }, filters: { type: object, additionalProperties: true }, search: { type: string } } }
 *           example: { categoryId: 66bca1f8d7432e0012345678, filters: { color: [black] } }
 *     responses:
 *       200: { description: Filter options returned. }
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get a product with minimal relationships and variations
 *     security: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { $ref: '#/components/schemas/CatalogId' } }
 *     responses:
 *       200: { description: Product retrieved. }
 *   put:
 *     tags: [Products]
 *     summary: Replace a product
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { $ref: '#/components/schemas/CatalogId' } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ProductWrite' }
 *           example: { name: Nike Sports T-Shirt, slug: nike-sports-t-shirt, description: Updated product description., categoryId: 66bca1f8d7432e0012345678, brandId: 66bca1f8d7432e0012345679, productType: VARIABLE, sku: NIKE-SPORTS, currency: BDT, sellingPrice: 1399, originalPrice: 1599, stock: { quantity: 18 }, status: ACTIVE, visibility: PUBLIC, featured: true, tags: [sportswear], attributes: { material: cotton }, thumbnail: { alt: Black Nike sports t-shirt, src: https://cdn.example.com/products/nike-shirt.webp, id: 1042 }, images: [] }
 *     responses:
 *       200: { description: Product replaced. }
 *   delete:
 *     tags: [Products]
 *     summary: Archive a product and its variations
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { $ref: '#/components/schemas/CatalogId' } }
 *     responses:
 *       200: { description: Product archived. }
 */
