"use strict";

/**
 * @openapi
 * components:
 *   schemas:
 *     BrandWrite:
 *       type: object
 *       required: [name, slug]
 *       properties:
 *         name: { type: string, example: Nike }
 *         slug: { type: string, example: nike }
 *         description: { type: string, example: Global sportswear and footwear brand. }
 *         logo: { type: string, maxLength: 1024, example: https://cdn.example.com/brands/nike.webp }
 *         website: { type: string, format: uri, example: https://www.nike.com }
 *         status: { type: string, enum: [DRAFT, ACTIVE, INACTIVE, ARCHIVED], example: ACTIVE }
 *         visibility: { type: string, enum: [PUBLIC, PRIVATE, HIDDEN], example: PUBLIC }
 *         seo: { $ref: '#/components/schemas/CatalogSeo' }
 *         publishedAt: { type: string, format: date-time, nullable: true, example: '2026-08-13T09:00:00.000Z' }
 *
 * /brands:
 *   post:
 *     tags: [Brands]
 *     summary: Create a global brand
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BrandWrite' }
 *           example:
 *             name: Nike
 *             slug: nike
 *             description: Global sportswear and footwear brand.
 *             logo: https://cdn.example.com/brands/nike.webp
 *             website: https://www.nike.com
 *             status: ACTIVE
 *             visibility: PUBLIC
 *             seo:
 *               title: Nike Products | GadgetSimp
 *               description: Shop Nike products online.
 *               keywords: [nike, nike products]
 *               canonicalUrl: https://gadgetsimp.dev/brands/nike
 *               noIndex: false
 *               noFollow: false
 *               ogTitle: Nike Products
 *               ogDescription: Explore Nike products.
 *               ogImage: https://cdn.example.com/brands/nike-og.webp
 *               twitterTitle: Nike Products
 *               twitterDescription: Explore Nike products.
 *               twitterImage: https://cdn.example.com/brands/nike-twitter.webp
 *             publishedAt: '2026-08-13T09:00:00.000Z'
 *     responses:
 *       201: { description: Brand created. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /brands/filter:
 *   post:
 *     tags: [Brands]
 *     summary: Filter public brands
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               search: { type: string, maxLength: 120 }
 *               pagination:
 *                 type: object
 *                 properties:
 *                   page: { type: integer, minimum: 0, default: 0 }
 *                   limit: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *           example: { search: nike, pagination: { page: 0, limit: 20 } }
 *     responses:
 *       200: { description: Paginated public brands returned. }
 *
 * /brands/{id}:
 *   get:
 *     tags: [Brands]
 *     summary: Get a public brand
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/CatalogId' }
 *         example: 66bca1f8d7432e0012345679
 *     responses:
 *       200: { description: Brand retrieved. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     tags: [Brands]
 *     summary: Replace a brand
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/CatalogId' }
 *         example: 66bca1f8d7432e0012345679
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BrandWrite' }
 *           example:
 *             name: Nike
 *             slug: nike
 *             description: Updated global sportswear brand description.
 *             logo: https://cdn.example.com/brands/nike.webp
 *             website: https://www.nike.com
 *             status: ACTIVE
 *             visibility: PUBLIC
 *             seo:
 *               title: Nike Products | GadgetSimp
 *               description: Shop the latest Nike products online.
 *               keywords: [nike, sportswear]
 *               canonicalUrl: https://gadgetsimp.dev/brands/nike
 *               noIndex: false
 *               noFollow: false
 *             publishedAt: '2026-08-13T09:00:00.000Z'
 *     responses:
 *       200: { description: Brand replaced. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   delete:
 *     tags: [Brands]
 *     summary: Archive a brand
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/CatalogId' }
 *         example: 66bca1f8d7432e0012345679
 *     responses:
 *       200: { description: Brand archived. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
