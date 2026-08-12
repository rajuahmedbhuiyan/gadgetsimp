"use strict";

/**
 * OpenAPI description of the user routes. Documentation only.
 */

/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get your profile
 *     responses:
 *       200:
 *         description: Profile.
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
 *                         user: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   patch:
 *     tags: [Users]
 *     summary: Update your profile
 *     description: >
 *       Accepts name, phone and avatar only. Sending `role`, `isActive` or
 *       `email` is rejected with 422 rather than ignored.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               firstName: { type: string, example: Raju }
 *               lastName: { type: string, example: Ahmed }
 *               phone: { type: string, example: "+8801712345678" }
 *               avatarUrl: { type: string, format: uri }
 *     responses:
 *       200:
 *         description: Updated profile.
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
 *                         user: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List users
 *     description: Requires `ROLE_MODERATOR` or above.
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - in: query
 *         name: role
 *         schema: { $ref: '#/components/schemas/Role' }
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: ['true', 'false'] }
 *     responses:
 *       200:
 *         description: Paginated users.
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
 *                         users:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/User' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get a user by id (self, or ROLE_MODERATOR and above)
 *     description: >
 *       A customer requesting someone else's id gets 404 rather than 403 - a
 *       403 would confirm the account exists, and sequential integer ids make
 *       walking the range trivial.
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdPath'
 *     responses:
 *       200:
 *         description: User.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 * /users/{id}/role:
 *   patch:
 *     tags: [Users]
 *     summary: Change a user's role
 *     description: >
 *       Requires `ROLE_ADMIN` or above, and is guarded three ways: you cannot
 *       change your own role, you cannot assign a role at or above your own
 *       rank, and you cannot modify a user senior to you. So an admin may
 *       create moderators but never another admin, and only an owner mints
 *       owners. The last remaining owner cannot be demoted.
 *
 *
 *       Bumps the target's token version, so the new role applies on their
 *       very next request rather than whenever their token happens to expire.
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdPath'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { $ref: '#/components/schemas/Role' }
 *     responses:
 *       200:
 *         description: Role updated.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403:
 *         description: Target is senior to you, or the requested role is at or above your own rank.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               statusCode: 403
 *               message: 'You can only assign roles below your own. Available to you: ROLE_CUSTOMER, ROLE_MODERATOR'
 *               code: ROLE_ABOVE_ACTOR
 *               errors: []
 *       409: { $ref: '#/components/responses/Conflict' }
 *
 * /users/{id}/status:
 *   patch:
 *     tags: [Users]
 *     summary: Activate or deactivate an account
 *     description: >
 *       Requires `ROLE_ADMIN` or above. Deactivating terminates every session
 *       the user holds. The same seniority rules as role changes apply, and
 *       the last remaining owner cannot be deactivated.
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdPath'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isActive]
 *             properties:
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Status updated.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
