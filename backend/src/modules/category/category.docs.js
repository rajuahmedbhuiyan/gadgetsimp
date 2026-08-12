"use strict";

/**
 * OpenAPI description of the category routes. Documentation only.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     Category:
 *       type: object
 *       properties:
 *         id: { type: string, example: 6712f0c2a1b4d3e5f6a7b8c9 }
 *         name: { type: string, example: Laptops }
 *         slug: { type: string, example: laptops }
 *         description: { type: string }
 *         imageUrl: { type: string, nullable: true }
 *         parent: { type: string, nullable: true, example: 6712f0c2a1b4d3e5f6a7b8c0 }
 *         path:
 *           type: string
 *           description: Materialised ancestor chain, used for subtree queries.
 *           example: /electronics/laptops
 *         depth: { type: integer, example: 1, maximum: 4 }
 *         displayOrder: { type: integer, example: 10 }
 *         isActive: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     CategoryNode:
 *       type: object
 *       description: A category with its descendants nested inline.
 *       properties:
 *         id: { type: string }
 *         name: { type: string, example: Electronics }
 *         slug: { type: string, example: electronics }
 *         imageUrl: { type: string, nullable: true }
 *         depth: { type: integer, example: 0 }
 *         displayOrder: { type: integer }
 *         isActive: { type: boolean }
 *         children:
 *           type: array
 *           items: { $ref: '#/components/schemas/CategoryNode' }
 *
 * /categories:
 *   get:
 *     tags: [Categories]
 *     summary: List categories
 *     description: >
 *       Returns a flat paginated list by default. Pass `tree=true` for the
 *       full nested taxonomy in a single response - the shape a navigation
 *       menu wants, assembled from one query rather than one per level.
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - in: query
 *         name: parent
 *         schema: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
 *         description: Return only direct children of this category.
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: ['true', 'false'] }
 *       - in: query
 *         name: tree
 *         schema: { type: string, enum: ['true', 'false'] }
 *         description: Return a nested tree instead of a paginated list.
 *     responses:
 *       200:
 *         description: Categories.
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
 *                         categories:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/Category' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *   post:
 *     tags: [Categories]
 *     summary: Create a category (admin)
 *     description: >
 *       Omit `parent` for a root category. Nesting is capped at 4 levels;
 *       sibling names must be unique, but the same name may appear under
 *       different parents.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: Laptops }
 *               description: { type: string }
 *               imageUrl: { type: string, format: uri }
 *               parent: { type: string, nullable: true, pattern: '^[0-9a-fA-F]{24}$' }
 *               displayOrder: { type: integer, default: 0 }
 *               isActive: { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Category created.
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
 *                         category: { $ref: '#/components/schemas/Category' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *
 * /categories/{slug}:
 *   get:
 *     tags: [Categories]
 *     summary: Get a category by slug, with its active children
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *         example: laptops
 *     responses:
 *       200:
 *         description: Category with children.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 * /categories/{id}:
 *   patch:
 *     tags: [Categories]
 *     summary: Update a category (admin)
 *     description: >
 *       Renaming regenerates the slug and rewrites the stored path of every
 *       descendant. Setting a new `parent` moves the whole subtree; moving a
 *       category beneath one of its own descendants is rejected.
 *     parameters:
 *       - $ref: '#/components/parameters/ObjectIdPath'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               imageUrl: { type: string, format: uri }
 *               parent: { type: string, nullable: true }
 *               displayOrder: { type: integer }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Category updated.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Categories]
 *     summary: Delete a category (admin)
 *     description: >
 *       Refused with 409 while the category still has subcategories or
 *       assigned products, so the catalog cannot be left with dangling
 *       references.
 *     parameters:
 *       - $ref: '#/components/parameters/ObjectIdPath'
 *     responses:
 *       200:
 *         description: Category deleted.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
