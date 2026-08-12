"use strict";

/**
 * OpenAPI description of the public storefront. Documentation only.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     ShopCard:
 *       type: object
 *       description: >
 *         The lightweight shape a storefront grid renders. Deliberately not the
 *         full product: descriptions, attribute maps, galleries and SEO are all
 *         omitted, because none of them appear on a card and all of them travel
 *         over the wire. Projected in the database, so a 24-item page stays
 *         small. Use `GET /shop/{slug}` for the full record.
 *       properties:
 *         id: { type: string, example: 6712f0c2a1b4d3e5f6a7b8c9 }
 *         name: { type: string, example: Nike Sports T-Shirt }
 *         slug: { type: string, example: nike-sports-t-shirt }
 *         thumbnail: { $ref: '#/components/schemas/ProductImage' }
 *         productType: { type: string, enum: [SIMPLE, VARIABLE], example: VARIABLE }
 *         featured: { type: boolean, example: true }
 *         currency: { type: string, example: BDT }
 *         sellingPrice: { type: number, example: 1299 }
 *         originalPrice: { type: number, nullable: true, example: 1499 }
 *         discountPercent:
 *           type: integer
 *           description: Computed, 0 when there is no struck-through price.
 *           example: 13
 *         inStock:
 *           type: boolean
 *           description: >
 *             True unless the product is flagged out of stock, or inventory is
 *             tracked, exhausted and backorders are off.
 *           example: true
 *         pricing:
 *           type: object
 *           description: Effective range across variants. For a simple product both ends match sellingPrice.
 *           properties:
 *             min: { type: number, example: 1299 }
 *             max: { type: number, example: 1799 }
 *             currency: { type: string, example: BDT }
 *         brandId:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: string }
 *             name: { type: string, example: Nike }
 *             slug: { type: string, example: nike }
 *
 *     ShopCategory:
 *       type: object
 *       description: The minimal shape a category tile renders.
 *       properties:
 *         id: { type: string, example: 6712f0c2a1b4d3e5f6a7b8c9 }
 *         name: { type: string, example: T-Shirts }
 *         slug: { type: string, example: t-shirts }
 *         image: { type: string, nullable: true, example: https://cdn.example.com/categories/t-shirts.webp }
 *         parentId: { type: string, nullable: true }
 *         showInHome: { type: boolean, example: true }
 *         sortOrder: { type: integer, example: 10 }
 *
 *     ShopFilterRequest:
 *       type: object
 *       description: >
 *         Everything is addressed by **slug**, not id - a shopper's URL is
 *         `/shop/laptops`, so the API speaks the same language and no lookup is
 *         needed to render a page.
 *       properties:
 *         categorySlugs:
 *           type: array
 *           items: { type: string }
 *           description: >
 *             One or more categories. Each expands to its whole subtree, so
 *             `electronics` also returns products filed under its children, and
 *             the results are unioned - which is what a landing page spanning
 *             several categories needs.
 *           example: [t-shirts, hoodies]
 *         brandSlugs:
 *           type: array
 *           items: { type: string }
 *           description: Static filter. Matches any of the listed brands.
 *           example: [nike, adidas]
 *         search: { type: string, example: sports t-shirt }
 *         price:
 *           type: object
 *           description: >
 *             Static filter on the **effective** price, so a variable product is
 *             matched on its variant range rather than a price it does not have.
 *           properties:
 *             min: { type: number, example: 500 }
 *             max: { type: number, example: 2000 }
 *         inStock: { type: boolean, description: Static filter. Buyable right now., example: true }
 *         featured: { type: boolean, description: Static filter., example: true }
 *         filters:
 *           type: object
 *           description: >
 *             Dynamic, category-driven attribute filters, keyed by attribute
 *             key. Values inside one filter are ORed; different filters are
 *             ANDed. A value is either a list or a `{min,max}` range. Requires
 *             `categorySlugs`, since attribute keys are resolved from the
 *             category configuration. Call
 *             `GET /shop/filter-options/{categorySlug}` to discover which keys
 *             and values apply.
 *           additionalProperties: true
 *           example: { color: [black, white], size: [m] }
 *         sort:
 *           type: object
 *           properties:
 *             field: { type: string, enum: [relevance, price, name, createdAt], default: createdAt, example: price }
 *             direction: { type: string, enum: [asc, desc], default: desc, example: asc }
 *         pagination:
 *           type: object
 *           properties:
 *             page: { type: integer, minimum: 0, default: 0, description: Zero-based., example: 0 }
 *             limit: { type: integer, minimum: 1, maximum: 100, default: 24, example: 24 }
 *
 * /shop:
 *   post:
 *     tags: [Shop]
 *     summary: Browse the storefront
 *     description: >
 *       Public catalog listing. No authentication - a shopper browsing is not
 *       signed in. Only ACTIVE, PUBLIC, published products are ever returned,
 *       so drafts and hidden products cannot leak through this route.
 *
 *
 *       POST rather than GET because the filter set is open-ended - arrays of
 *       attribute values, ranges, and whatever a category adds later. Encoding
 *       that in a query string means bracket syntax every client has to agree
 *       on, and it runs into URL length limits.
 *
 *
 *       Returns the **lightweight** card shape. Fetch `GET /shop/{slug}` for
 *       full detail.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ShopFilterRequest' }
 *           example:
 *             categorySlugs: [t-shirts]
 *             brandSlugs: [nike]
 *             price: { min: 500, max: 2000 }
 *             inStock: true
 *             featured: false
 *             filters: { color: [black, white], size: [m] }
 *             sort: { field: price, direction: asc }
 *             pagination: { page: 0, limit: 24 }
 *     responses:
 *       200:
 *         description: Paginated product cards.
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
 *                           items: { $ref: '#/components/schemas/ShopCard' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       404:
 *         description: One of the category or brand slugs does not exist.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *
 * /shop/categories:
 *   post:
 *     tags: [Shop]
 *     summary: Storefront categories for a home page or nav menu
 *     description: >
 *       Returns the **minimal** shape a category tile renders - id, name, slug,
 *       image - not the full record. Paginated, zero-based, like the rest of
 *       the API.
 *
 *
 *       Two independent filters, because they answer different questions:
 *
 *
 *       - **`showInHome`** is curation: has someone chosen to surface this?
 *         Omit it and the flag is ignored entirely, returning every category
 *         with something to sell. Send `true` for the curated home-page set.
 *       - **"has at least one product"** is safety, and is applied by default.
 *         A tile leading to an empty grid is worse than one tile fewer. This
 *         counts the whole **subtree**, matching what the tile does when
 *         clicked - so a parent whose products all live in its children still
 *         appears.
 *
 *
 *       Set **`forceCategories: true`** to skip the product check and return
 *       empty categories too - useful for an admin preview or a nav menu that
 *       wants the full taxonomy. Named explicitly so an empty category on a
 *       live home page is always a deliberate choice.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               showInHome:
 *                 type: boolean
 *                 description: Omit to ignore the flag; `true` for the curated home-page set.
 *                 example: true
 *               forceCategories:
 *                 type: boolean
 *                 default: false
 *                 description: Skip the "must have at least one product" rule.
 *               search: { type: string, example: shirt }
 *               pagination:
 *                 type: object
 *                 properties:
 *                   page: { type: integer, minimum: 0, default: 0, example: 0 }
 *                   limit: { type: integer, minimum: 1, maximum: 100, default: 20, example: 12 }
 *           examples:
 *             homePage:
 *               summary: Curated home-page tiles that have stock
 *               value: { showInHome: true, pagination: { page: 0, limit: 12 } }
 *             allWithProducts:
 *               summary: Every category with something to sell
 *               value: {}
 *             fullTaxonomy:
 *               summary: Everything, including empty categories
 *               value: { forceCategories: true }
 *     responses:
 *       200:
 *         description: Paginated categories.
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
 *                           items: { $ref: '#/components/schemas/ShopCategory' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /shop/filter-options/{categorySlug}:
 *   get:
 *     tags: [Shop]
 *     summary: Filter options and facet counts for a category
 *     description: >
 *       Drives the filter sidebar: which attributes apply to this category,
 *       which values exist, and how many products each value would return.
 *
 *
 *       A **GET**, and therefore cacheable by the browser and any CDN in front -
 *       a category's sidebar is identical for every shopper and changes only
 *       when the catalog does. Counts come from the database under the same
 *       visibility rules as the listing, so a value showing "12" really does
 *       return 12 products.
 *
 *
 *       For counts narrowed by filters the shopper has already applied, read
 *       the facets returned alongside the results of `POST /shop`.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: categorySlug
 *         required: true
 *         schema: { type: string, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }
 *         example: t-shirts
 *     responses:
 *       200:
 *         description: Available filters with counts.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /shop/{slug}:
 *   get:
 *     tags: [Shop]
 *     summary: Full product detail by slug
 *     description: >
 *       The product page payload - full descriptions, attributes, gallery,
 *       variations and SEO.
 *
 *
 *       Applies the same visibility gate as the listing, and answers **404**
 *       rather than 403 for a product that is draft, hidden or not yet
 *       published - otherwise a guessable slug would be a preview link for
 *       unreleased products.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }
 *         example: nike-sports-t-shirt
 *     responses:
 *       200:
 *         description: Full product.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
