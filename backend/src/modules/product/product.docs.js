"use strict";

/**
 * @openapi
 * components:
 *   schemas:
 *     ProductWrite:
 *       type: object
 *       required: [name, slug, description, categoryIds, sellingPrice, thumbnail]
 *       properties:
 *         name: { type: string, example: Nike Sports T-Shirt }
 *         slug: { type: string, example: nike-sports-t-shirt }
 *         description: { type: string, example: Breathable performance t-shirt for everyday training. }
 *         shortDescription: { type: string, example: Lightweight performance t-shirt. }
 *         categoryIds:
 *           type: array
 *           minItems: 1
 *           maxItems: 20
 *           uniqueItems: true
 *           description: Direct category assignments. Send the most specific category; hierarchy is derived from parentId.
 *           items: { $ref: '#/components/schemas/CatalogId' }
 *           example: [66bca1f8d7432e0012345678]
 *         brandId: { $ref: '#/components/schemas/CatalogId' }
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
 *     ProductVariationWrite:
 *       type: object
 *       required: [options]
 *       properties:
 *         options: { type: object, additionalProperties: { type: string }, example: { color: black, size: m } }
 *         sku: { type: string, example: NIKE-SPORTS-BLACK-M }
 *         barcode: { type: string, example: '8941100500012' }
 *         sellingPrice: { type: number, minimum: 0, example: 1299 }
 *         originalPrice: { type: number, minimum: 0, example: 1499 }
 *         stock: { $ref: '#/components/schemas/Stock' }
 *         status: { type: string, enum: [DRAFT, ACTIVE, OUT_OF_STOCK], example: ACTIVE }
 *         image: { $ref: '#/components/schemas/ProductImage' }
 *         sortOrder: { type: integer, minimum: 0, example: 0 }
 *     ProductCreate:
 *       allOf:
 *         - $ref: '#/components/schemas/ProductWrite'
 *         - type: object
 *           properties:
 *             productType: { type: string, enum: [SIMPLE, VARIABLE], example: VARIABLE }
 *             variationOptions:
 *               type: object
 *               description: Required for VARIABLE products. Variations are persisted only during POST /products.
 *               additionalProperties: { type: array, items: { type: string } }
 *               example: { color: [black, white], size: [m, l] }
 *             variations:
 *               type: array
 *               description: Generated variation rows to save with this product. Use this instead of variationOptions when prices, stock, SKU or image differ per variation.
 *               items: { $ref: '#/components/schemas/ProductVariationWrite' }
 *     ProductUpdate:
 *       allOf:
 *         - $ref: '#/components/schemas/ProductWrite'
 *         - type: object
 *           properties:
 *             variationOptions:
 *               type: object
 *               description: Updates the product's variation option keys. Existing variation records are preserved.
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
 *             categoryIds: [66bca1f8d7432e0012345678]
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
 *             variations:
 *               - options: { color: black, size: m }
 *                 sku: NIKE-SPORTS-BLACK-M
 *                 sellingPrice: 1299
 *                 originalPrice: 1499
 *                 stock: { quantity: 8, trackInventory: true, allowBackorder: false, lowStockThreshold: 2, status: IN_STOCK }
 *                 status: ACTIVE
 *                 image: { alt: Black medium t-shirt, src: https://cdn.example.com/products/nike-shirt-black-m.webp, id: 1050 }
 *                 sortOrder: 0
 *               - options: { color: white, size: l }
 *                 sku: NIKE-SPORTS-WHITE-L
 *                 sellingPrice: 1349
 *                 stock: { quantity: 5, status: IN_STOCK }
 *                 status: ACTIVE
 *                 image: { alt: White large t-shirt, src: https://cdn.example.com/products/nike-shirt-white-l.webp }
 *                 sortOrder: 1
 *             shipping:
 *               requiresShipping: true
 *               freeShipping: false
 *               weight: { value: 0.25, unit: kg }
 *               dimensions: { length: 30, width: 24, height: 3, unit: cm }
 *             thumbnail: { alt: Black Nike sports t-shirt, src: https://cdn.example.com/products/nike-shirt.webp, id: 1042 }
 *             images:
 *               - { alt: Front view, src: https://cdn.example.com/products/nike-shirt-front.webp, id: 1043 }
 *               - { alt: Back view, src: https://cdn.example.com/products/nike-shirt-back.webp }
 *             seo:
 *               title: Nike Sports T-Shirt | Buy Online
 *               description: Shop the Nike Sports T-Shirt for training and everyday performance.
 *               keywords: [nike t-shirt, sports t-shirt, training shirt]
 *               canonicalUrl: https://gadgetsimp.dev/products/nike-sports-t-shirt
 *               noIndex: false
 *               noFollow: false
 *               ogTitle: Nike Sports T-Shirt
 *               ogDescription: Lightweight performance t-shirt for training.
 *               ogImage: https://cdn.example.com/products/nike-shirt-og.webp
 *               twitterTitle: Nike Sports T-Shirt
 *               twitterDescription: Lightweight performance t-shirt for training.
 *               twitterImage: https://cdn.example.com/products/nike-shirt-twitter.webp
 *     responses:
 *       201: { description: Product created. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 * /products/{id}/general:
 *   patch:
 *     tags: [Products]
 *     summary: Update general details
 *     description: >
 *       One panel of the admin product form. `PUT /products/{id}` replaces the
 *       whole document, so saving a single panel through it means round-tripping
 *       every field - and anything the form did not load comes back as a silent
 *       reset. These section patches save only what the panel owns.
 *
 *
 *       `productType` is not accepted: flipping VARIABLE to SIMPLE would orphan
 *       every generated SKU. Setting `status` to ACTIVE stamps `publishedAt`;
 *       setting it to DRAFT clears it. Changing `categoryIds` revalidates the
 *       stored attributes against the new categories.
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
 *               name: { type: string, example: Nike Sports T-Shirt }
 *               slug: { type: string, example: nike-sports-t-shirt }
 *               brandId: { type: string, nullable: true, example: 6712f0c2a1b4d3e5f6a7b8c9 }
 *               categoryIds: { type: array, items: { type: string }, example: [6712f0c2a1b4d3e5f6a7b8c9] }
 *               sku: { type: string, example: NIKE-SPORTS }
 *               status: { type: string, enum: [DRAFT, ACTIVE, OUT_OF_STOCK], example: ACTIVE }
 *               visibility: { type: string, enum: [PUBLIC, HIDDEN], example: PUBLIC }
 *               featured: { type: boolean, example: true }
 *           example:
 *             name: Nike Sports T-Shirt
 *             slug: nike-sports-t-shirt
 *             brandId: 6712f0c2a1b4d3e5f6a7b8c9
 *             categoryIds: [6712f0c2a1b4d3e5f6a7b8c9]
 *             status: ACTIVE
 *             visibility: PUBLIC
 *             featured: true
 *     responses:
 *       200: { description: General details updated. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /products/{id}/description:
 *   patch:
 *     tags: [Products]
 *     summary: Update descriptions
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
 *               description: { type: string, example: Breathable performance t-shirt for everyday training. }
 *               shortDescription: { type: string, nullable: true, example: Lightweight performance t-shirt. }
 *           example:
 *             description: Breathable performance t-shirt for everyday training, cut for movement.
 *             shortDescription: Lightweight performance t-shirt.
 *     responses:
 *       200: { description: Description updated. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /products/{id}/pricing:
 *   patch:
 *     tags: [Products]
 *     summary: Update pricing
 *     description: >
 *       `originalPrice` must stay at or above `sellingPrice`, and the rule is
 *       enforced against the **stored** record - so raising `sellingPrice`
 *       alone past the existing `originalPrice` is rejected with
 *       `PRODUCT_PRICE_ORDER_INVALID`. Send `originalPrice: null` to remove the
 *       struck-through price.
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
 *               sellingPrice: { type: number, minimum: 0, example: 1299 }
 *               originalPrice: { type: number, minimum: 0, nullable: true, example: 1499 }
 *               currency: { type: string, enum: [BDT], example: BDT }
 *           example: { sellingPrice: 1299, originalPrice: 1499 }
 *     responses:
 *       200: { description: Pricing updated. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422:
 *         description: Validation failed, or the price order is inconsistent with the stored record.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               statusCode: 422
 *               message: originalPrice must not be less than sellingPrice
 *               code: PRODUCT_PRICE_ORDER_INVALID
 *               errors:
 *                 - field: originalPrice
 *                   message: originalPrice (1499) is below sellingPrice (2000)
 *
 * /products/{id}/stock:
 *   patch:
 *     tags: [Products]
 *     summary: Update stock
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { $ref: '#/components/schemas/CatalogId' } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stock]
 *             properties:
 *               stock: { $ref: '#/components/schemas/Stock' }
 *           example: { stock: { quantity: 120, lowStockThreshold: 5, trackInventory: true } }
 *     responses:
 *       200: { description: Stock updated. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /products/{id}/attributes:
 *   patch:
 *     tags: [Products]
 *     summary: Update attributes and tags
 *     description: >
 *       Attributes are revalidated against the categories already on the
 *       product, so a key the category does not configure is rejected with
 *       `PRODUCT_ATTRIBUTE_INVALID`.
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
 *               attributes: { type: object, additionalProperties: true, example: { material: cotton, fit: regular } }
 *               tags: { type: array, items: { type: string }, example: [sportswear, training] }
 *           example: { attributes: { material: cotton }, tags: [sportswear, training] }
 *     responses:
 *       200: { description: Attributes and tags updated. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /products/{id}/media:
 *   patch:
 *     tags: [Products]
 *     summary: Update thumbnail and gallery
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
 *               thumbnail: { $ref: '#/components/schemas/ProductImage' }
 *               images: { type: array, items: { $ref: '#/components/schemas/ProductImage' } }
 *           example:
 *             thumbnail: { alt: Black Nike sports t-shirt, src: https://cdn.example.com/products/nike-shirt.webp, id: 1042 }
 *             images:
 *               - { alt: Front view, src: https://cdn.example.com/products/nike-shirt-front.webp, id: 1043 }
 *     responses:
 *       200: { description: Media updated. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /products/{id}/featured:
 *   patch:
 *     tags: [Products]
 *     summary: Feature or unfeature a product
 *     description: A one-decision toggle, for a product table's quick actions.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { $ref: '#/components/schemas/CatalogId' } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [featured]
 *             properties:
 *               featured: { type: boolean, example: true }
 *           example: { featured: true }
 *     responses:
 *       200: { description: Featured flag updated. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /products/{id}/status:
 *   patch:
 *     tags: [Products]
 *     summary: Publish, unpublish or hide a product
 *     description: >
 *       Setting `status` to ACTIVE stamps `publishedAt` if it was never set;
 *       setting DRAFT clears it. `visibility` controls whether a published
 *       product appears in the storefront at all.
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
 *               status: { type: string, enum: [DRAFT, ACTIVE, OUT_OF_STOCK], example: ACTIVE }
 *               visibility: { type: string, enum: [PUBLIC, HIDDEN], example: PUBLIC }
 *           example: { status: ACTIVE, visibility: PUBLIC }
 *     responses:
 *       200: { description: Status updated. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /products/{id}/seo:
 *   patch:
 *     tags: [Products]
 *     summary: Update SEO
 *     description: >
 *       Missing SEO fields are derived from the **stored** product - name,
 *       descriptions, slug, thumbnail and tags - so sending only a title still
 *       yields a complete SEO block.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { $ref: '#/components/schemas/CatalogId' } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [seo]
 *             properties:
 *               seo: { $ref: '#/components/schemas/CatalogSeo' }
 *           example:
 *             seo:
 *               title: Nike Sports T-Shirt | Buy Online
 *               description: Shop the Nike Sports T-Shirt for training and everyday performance.
 *               keywords: [nike t-shirt, sports t-shirt, training shirt]
 *               canonicalUrl: https://gadgetsimp.dev/products/nike-sports-t-shirt
 *               noIndex: false
 *               noFollow: false
 *               ogTitle: Nike Sports T-Shirt
 *               ogDescription: Lightweight performance t-shirt for training.
 *               ogImage: https://cdn.example.com/products/nike-shirt-og.webp
 *               twitterTitle: Nike Sports T-Shirt
 *               twitterDescription: Lightweight performance t-shirt for training.
 *               twitterImage: https://cdn.example.com/products/nike-shirt-twitter.webp
 *     responses:
 *       200: { description: SEO updated. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /products/filter:
 *   post:
 *     tags: [Products]
 *     summary: Filter products for staff
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
 *       200: { description: Paginated products with minimal categoryIds and brandId objects. }
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get a product with minimal relationships and variations
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
 *           schema: { $ref: '#/components/schemas/ProductUpdate' }
 *           example:
 *             name: Nike Sports T-Shirt
 *             slug: nike-sports-t-shirt
 *             description: Updated breathable performance t-shirt for everyday training.
 *             shortDescription: Lightweight performance t-shirt.
 *             categoryIds: [66bca1f8d7432e0012345678]
 *             brandId: 66bca1f8d7432e0012345679
 *             sku: NIKE-SPORTS
 *             currency: BDT
 *             sellingPrice: 1399
 *             originalPrice: 1599
 *             stock: { quantity: 18, trackInventory: true, allowBackorder: false, lowStockThreshold: 5, status: IN_STOCK }
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
 *             seo:
 *               title: Nike Sports T-Shirt | Buy Online
 *               description: Shop the Nike Sports T-Shirt for training and everyday performance.
 *               keywords: [nike t-shirt, sports t-shirt, training shirt]
 *               canonicalUrl: https://gadgetsimp.dev/products/nike-sports-t-shirt
 *               noIndex: false
 *               noFollow: false
 *               ogTitle: Nike Sports T-Shirt
 *               ogDescription: Lightweight performance t-shirt for training.
 *               ogImage: https://cdn.example.com/products/nike-shirt-og.webp
 *               twitterTitle: Nike Sports T-Shirt
 *               twitterDescription: Lightweight performance t-shirt for training.
 *               twitterImage: https://cdn.example.com/products/nike-shirt-twitter.webp
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
