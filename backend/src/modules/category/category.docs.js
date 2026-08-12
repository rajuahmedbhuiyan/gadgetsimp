"use strict";

/**
 * @openapi
 * components:
 *   schemas:
 *     CategoryParentSummary:
 *       type: object
 *       nullable: true
 *       properties:
 *         id: { $ref: '#/components/schemas/CatalogId' }
 *         name: { type: string, example: Clothing }
 *         slug: { type: string, example: clothing }
 *     CategoryAttributeSummary:
 *       type: object
 *       properties:
 *         id: { $ref: '#/components/schemas/CatalogId' }
 *         name: { type: string, example: Color }
 *         key: { type: string, example: color }
 *         source: { type: string, enum: [product, variant, entity], example: variant }
 *         type: { type: string, enum: [checkbox, radio, select, color, range], example: color }
 *     CategoryWrite:
 *       type: object
 *       required: [name, slug]
 *       properties:
 *         name: { type: string, example: T-Shirts }
 *         slug: { type: string, example: t-shirts }
 *         description: { type: string, example: Performance, casual and everyday t-shirts. }
 *         parentId:
 *           allOf:
 *             - $ref: '#/components/schemas/CatalogId'
 *           nullable: true
 *           example: 66bca1f8d7432e0012345677
 *         status: { type: string, enum: [DRAFT, ACTIVE, INACTIVE, ARCHIVED], example: ACTIVE }
 *         visibility: { type: string, enum: [PUBLIC, PRIVATE, HIDDEN], example: PUBLIC }
 *         image: { type: string, maxLength: 1024, example: https://cdn.example.com/categories/t-shirts.webp }
 *         attributes:
 *           type: array
 *           description: Attribute Library ids. Every id must reference an active, non-deleted attribute.
 *           items: { $ref: '#/components/schemas/CatalogId' }
 *           example: [66bca1f8d7432e0012345683, 66bca1f8d7432e0012345680, 66bca1f8d7432e0012345684]
 *         seo: { $ref: '#/components/schemas/CatalogSeo' }
 *         sortOrder: { type: integer, minimum: 0, example: 20 }
 *
 * /categories:
 *   post:
 *     tags: [Categories]
 *     summary: Create a hierarchical category
 *     description: Admin and above. The attributes array accepts only active Attribute Library ids; the backend validates every reference before saving.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CategoryWrite' }
 *           example:
 *             name: T-Shirts
 *             slug: t-shirts
 *             description: Performance, casual and everyday t-shirts.
 *             parentId: 66bca1f8d7432e0012345677
 *             status: ACTIVE
 *             visibility: PUBLIC
 *             image: https://cdn.example.com/categories/t-shirts.webp
 *             attributes: [66bca1f8d7432e0012345683, 66bca1f8d7432e0012345680, 66bca1f8d7432e0012345684]
 *             seo:
 *               title: Buy T-Shirts Online | GadgetSimp
 *               description: Shop performance and casual t-shirts online.
 *               keywords: [t-shirts, mens t-shirts]
 *               canonicalUrl: https://gadgetsimp.dev/categories/t-shirts
 *               noIndex: false
 *               noFollow: false
 *               ogTitle: T-Shirts
 *               ogDescription: Explore our t-shirt collection.
 *               ogImage: https://cdn.example.com/categories/t-shirts-og.webp
 *               twitterTitle: T-Shirts
 *               twitterDescription: Explore our t-shirt collection.
 *               twitterImage: https://cdn.example.com/categories/t-shirts-twitter.webp
 *             sortOrder: 20
 *     responses:
 *       201: { description: Category created. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /categories/filter:
 *   post:
 *     tags: [Categories]
 *     summary: Filter public categories
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               parentId:
 *                 allOf:
 *                   - $ref: '#/components/schemas/CatalogId'
 *                 nullable: true
 *               search: { type: string, maxLength: 120 }
 *               pagination:
 *                 type: object
 *                 properties:
 *                   page: { type: integer, minimum: 0, default: 0 }
 *                   limit: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *           example:
 *             parentId: 66bca1f8d7432e0012345677
 *             search: shirts
 *             pagination: { page: 0, limit: 20 }
 *     responses:
 *       200: { description: Paginated public categories returned. }
 *
 * /categories/filter-groupped:
 *   post:
 *     tags: [Categories]
 *     summary: Filter categories as a grouped hierarchy
 *     description: Returns nested children arrays ordered by sortOrder, name and id. Search retains matching categories and their ancestors.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               parentId:
 *                 allOf:
 *                   - $ref: '#/components/schemas/CatalogId'
 *                 nullable: true
 *                 description: Omit or send null for the complete root tree; send an id for that category's descendants.
 *               search: { type: string, maxLength: 120 }
 *           example:
 *             parentId: null
 *             search: shirts
 *     responses:
 *       200:
 *         description: Nested category tree returned.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               statusCode: 200
 *               message: Grouped categories retrieved
 *               data:
 *                 categories:
 *                   - id: 66bca1f8d7432e0012345675
 *                     name: Men
 *                     slug: men
 *                     parentId: null
 *                     attributes: []
 *                     sortOrder: 0
 *                     children:
 *                       - id: 66bca1f8d7432e0012345676
 *                         name: Clothing
 *                         slug: clothing
 *                         parentId: { id: 66bca1f8d7432e0012345675, name: Men, slug: men }
 *                         attributes: []
 *                         sortOrder: 0
 *                         children:
 *                           - id: 66bca1f8d7432e0012345678
 *                             name: T-Shirts
 *                             slug: t-shirts
 *                             parentId: { id: 66bca1f8d7432e0012345676, name: Clothing, slug: clothing }
 *                             attributes:
 *                               - { id: 66bca1f8d7432e0012345680, name: Color, key: color, source: variant, type: color }
 *                             sortOrder: 0
 *                             children: []
 *
 * /categories/sort:
 *   put:
 *     tags: [Categories]
 *     summary: Reorder or move categories
 *     description: Admin and above. Only parentId and sortOrder are changed; all other category data remains untouched. Omit parentId to keep the current parent, or send null to move a category to the root.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [categories]
 *             properties:
 *               categories:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 500
 *                 items:
 *                   type: object
 *                   required: [id, sortOrder]
 *                   properties:
 *                     id: { $ref: '#/components/schemas/CatalogId' }
 *                     parentId:
 *                       allOf:
 *                         - $ref: '#/components/schemas/CatalogId'
 *                       nullable: true
 *                     sortOrder: { type: integer, minimum: 0 }
 *           example:
 *             categories:
 *               - { id: 66bca1f8d7432e0012345678, parentId: 66bca1f8d7432e0012345676, sortOrder: 0 }
 *               - { id: 66bca1f8d7432e0012345685, parentId: 66bca1f8d7432e0012345676, sortOrder: 1 }
 *               - { id: 66bca1f8d7432e0012345686, parentId: null, sortOrder: 2 }
 *     responses:
 *       200:
 *         description: Category positions updated; response contains only structural fields.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               statusCode: 200
 *               message: Category positions updated
 *               data:
 *                 categories:
 *                   - { id: 66bca1f8d7432e0012345678, parentId: { id: 66bca1f8d7432e0012345676, name: Clothing, slug: clothing }, sortOrder: 0 }
 *                   - { id: 66bca1f8d7432e0012345685, parentId: { id: 66bca1f8d7432e0012345676, name: Clothing, slug: clothing }, sortOrder: 1 }
 *                   - { id: 66bca1f8d7432e0012345686, parentId: null, sortOrder: 2 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /categories/{id}/configuration:
 *   get:
 *     tags: [Categories]
 *     summary: Get resolved category attribute configuration
 *     description: Returns category flags together with resolved Attribute Library metadata for data-driven product forms.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/CatalogId' }
 *         example: 66bca1f8d7432e0012345678
 *     responses:
 *       200: { description: Category configuration retrieved. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 * /categories/{id}:
 *   get:
 *     tags: [Categories]
 *     summary: Get a public category
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/CatalogId' }
 *         example: 66bca1f8d7432e0012345678
 *     responses:
 *       200: { description: Category retrieved. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     tags: [Categories]
 *     summary: Replace a category
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/CatalogId' }
 *         example: 66bca1f8d7432e0012345678
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CategoryWrite' }
 *           example:
 *             name: Men's T-Shirts
 *             slug: mens-t-shirts
 *             description: Updated performance and casual t-shirt category.
 *             parentId: 66bca1f8d7432e0012345677
 *             status: ACTIVE
 *             visibility: PUBLIC
 *             image: https://cdn.example.com/categories/mens-t-shirts.webp
 *             attributes: [66bca1f8d7432e0012345683, 66bca1f8d7432e0012345680]
 *             seo:
 *               title: Buy Men's T-Shirts Online
 *               description: Shop men's t-shirts online.
 *               keywords: [mens t-shirts]
 *               canonicalUrl: https://gadgetsimp.dev/categories/mens-t-shirts
 *               noIndex: false
 *               noFollow: false
 *             sortOrder: 20
 *     responses:
 *       200: { description: Category replaced. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   delete:
 *     tags: [Categories]
 *     summary: Archive a category
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/CatalogId' }
 *         example: 66bca1f8d7432e0012345678
 *     responses:
 *       200: { description: Category archived. }
 *       409: { description: Category still has active children. }
 */
