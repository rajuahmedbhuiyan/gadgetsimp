"use strict";

/**
 * @openapi
 * components:
 *   schemas:
 *     AttributeWrite:
 *       type: object
 *       required: [name, key, slug, source, type]
 *       properties:
 *         name: { type: string, example: Price Range }
 *         key: { type: string, pattern: '^[a-z][a-z0-9_]*$', example: price_range }
 *         slug: { type: string, example: price-range }
 *         description: { type: string, example: Customer-facing product price range. }
 *         source: { type: string, enum: [product, variant, entity], example: product }
 *         type: { type: string, enum: [checkbox, radio, select, color, range], example: range }
 *         status: { type: string, enum: [DRAFT, ACTIVE, INACTIVE, ARCHIVED], example: ACTIVE }
 *         min:
 *           type: number
 *           description: Required only when type is range.
 *           example: 0
 *         max:
 *           type: number
 *           description: Required only when type is range and must be greater than or equal to min.
 *           example: 100000
 *         display:
 *           type: object
 *           properties:
 *             helpText: { type: string, example: Select every color available for this product. }
 *             placeholder: { type: string, example: Choose colors }
 *             showInProductDetails: { type: boolean, example: true }
 *
 * /attributes:
 *   post:
 *     tags: [Attributes]
 *     summary: Create an Attribute Library entry
 *     description: Admin and above. Attribute names and keys are database-driven, not application enums.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AttributeWrite' }
 *           example:
 *             name: Price Range
 *             key: price_range
 *             slug: price-range
 *             description: Customer-facing product price range.
 *             source: product
 *             type: range
 *             status: ACTIVE
 *             min: 0
 *             max: 100000
 *             display:
 *               helpText: Enter a price within the supported range.
 *               placeholder: Enter price
 *               showInProductDetails: true
 *     responses:
 *       201: { description: Attribute created. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /attributes/filter:
 *   post:
 *     tags: [Attributes]
 *     summary: Filter and paginate the Attribute Library
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               search: { type: string, maxLength: 120 }
 *               source: { type: string, enum: [product, variant, entity] }
 *               type: { type: string, enum: [checkbox, radio, select, color, range] }
 *               status: { type: string, enum: [DRAFT, ACTIVE, INACTIVE, ARCHIVED] }
 *               page: { type: integer, minimum: 0, default: 0 }
 *               limit: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *           example: { search: color, source: variant, type: color, status: ACTIVE, page: 0, limit: 20 }
 *     responses:
 *       200: { description: Paginated attributes returned. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *
 * /attributes/{id}:
 *   get:
 *     tags: [Attributes]
 *     summary: Get an Attribute Library entry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/CatalogId' }
 *         example: 66bca1f8d7432e0012345680
 *     responses:
 *       200: { description: Attribute retrieved. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     tags: [Attributes]
 *     summary: Replace an Attribute Library entry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/CatalogId' }
 *         example: 66bca1f8d7432e0012345680
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AttributeWrite' }
 *           example:
 *             name: Product Price Range
 *             key: price_range
 *             slug: price-range
 *             description: Updated customer-facing product price range.
 *             source: product
 *             type: range
 *             status: ACTIVE
 *             min: 0
 *             max: 150000
 *             display: { helpText: Enter a supported price., placeholder: Enter price, showInProductDetails: true }
 *     responses:
 *       200: { description: Attribute replaced. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   delete:
 *     tags: [Attributes]
 *     summary: Archive an attribute
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/CatalogId' }
 *         example: 66bca1f8d7432e0012345680
 *     responses:
 *       200: { description: Attribute archived. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
