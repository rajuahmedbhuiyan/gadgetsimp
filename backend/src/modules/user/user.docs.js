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
 *       Accepts name, phone and `image` only. The schema is strict, so sending
 *       `role`, `status` or `email` is rejected with 422 rather than silently
 *       ignored - including the retired `avatarUrl`, which is now `image`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               fullName: { type: string, maxLength: 120, example: Raju Ahmed }
 *               phone: { type: string, example: "+8801712345678" }
 *               image:
 *                 type: string
 *                 format: uri
 *                 description: Profile picture URL.
 *                 example: https://cdn.gadgetsimp.dev/u/1003.jpg
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
 * /users/filter:
 *   post:
 *     tags: [Users]
 *     summary: Filter and page through users
 *     description: >
 *       Requires **`ROLE_ADMIN` or above** (so admins and owners).
 *
 *
 *       A POST with a JSON body rather than a GET with a query string, because
 *       the filter set is open-ended: arrays of roles and statuses, date
 *       ranges, and whatever gets added later. Encoding that in a query string
 *       means repeated keys and bracket syntax every client has to agree on,
 *       and it runs into URL length limits.
 *
 *
 *       Returns **complete user records**, not a trimmed projection - minus
 *       the secrets, which are never serialised at all.
 *
 *
 *       Soft-deleted accounts are excluded unless `includeDeleted` is true, or
 *       `status` explicitly asks for them. The body is strict: an unknown
 *       filter key is a 422 rather than being quietly ignored, so a typo in a
 *       filter cannot silently widen the result set.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page:
 *                 type: integer
 *                 minimum: 0
 *                 default: 0
 *                 description: Zero-based - the first page is 0.
 *               limit: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *               search:
 *                 type: string
 *                 description: >
 *                   Prefix match on first and last name, contains match on
 *                   email. Regex metacharacters are escaped and treated as
 *                   literal text.
 *                 example: raju
 *               role:
 *                 oneOf:
 *                   - $ref: '#/components/schemas/Role'
 *                   - type: array
 *                     items: { $ref: '#/components/schemas/Role' }
 *                 description: One role or a list.
 *               status:
 *                 oneOf:
 *                   - $ref: '#/components/schemas/UserStatus'
 *                   - type: array
 *                     items: { $ref: '#/components/schemas/UserStatus' }
 *               emailVerified: { type: boolean }
 *               createdFrom: { type: string, format: date-time, example: 2026-01-01 }
 *               createdTo: { type: string, format: date-time, example: 2026-12-31 }
 *               sortBy:
 *                 type: string
 *                 enum: [createdAt, lastLoginAt, fullName, email, role, status]
 *                 default: createdAt
 *               sortOrder: { type: string, enum: [asc, desc], default: desc }
 *               includeDeleted:
 *                 type: boolean
 *                 default: false
 *                 description: Include soft-deleted accounts.
 *           examples:
 *             everything:
 *               summary: First page, newest first
 *               value: {}
 *             staffOnly:
 *               summary: Active staff, alphabetical
 *               value:
 *                 role: [ROLE_MODERATOR, ROLE_ADMIN, ROLE_OWNER]
 *                 status: ACTIVE
 *                 sortBy: fullName
 *                 sortOrder: asc
 *             search:
 *               summary: Search with a date range
 *               value: { search: raju, createdFrom: 2026-01-01, limit: 50 }
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
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /users/create:
 *   post:
 *     tags: [Users]
 *     summary: Create a user account (owner only)
 *     description: >
 *       Creates an account directly, bypassing the email-verification signup
 *       flow. **Requires `ROLE_OWNER`** - not admin. Creating accounts
 *       outright, skipping verification and choosing the role, is the most
 *       privileged write in the API.
 *
 *
 *       Creation and filtering sit on sibling paths (`/users/create` and
 *       `/users/filter`) rather than sharing `POST /users`, so neither can be
 *       triggered by malforming the other's body.
 *
 *
 *       The account is created **already verified** and can sign in
 *       immediately. `password` is optional - omit it and one is generated,
 *       emailed to the new user, and returned **once** as `generatedPassword`.
 *       A password the caller supplied is never echoed back.
 *
 *
 *       The role must be **below** the creator's own rank, the same rule
 *       `/users/{id}/role` enforces, so an owner can create admins but not
 *       another owner.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email]
 *             properties:
 *               fullName: { type: string, maxLength: 120, example: Nadia Khan }
 *               email: { type: string, format: email, example: nadia@example.com }
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: Optional. Generated automatically when omitted.
 *               role:
 *                 allOf:
 *                   - $ref: '#/components/schemas/Role'
 *                 description: Defaults to ROLE_CUSTOMER. Must be below your own rank.
 *               phone: { type: string, example: "+8801712345678" }
 *               image: { type: string, format: uri }
 *               sendEmail:
 *                 type: boolean
 *                 default: true
 *                 description: Set false to create the account silently.
 *     responses:
 *       201:
 *         description: User created.
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
 *                         generatedPassword:
 *                           type: string
 *                           description: Present only when the API generated it. Shown once.
 *                           example: Kp7$mQx2Rt9zVw4n
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/ValidationError' }
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
 *   delete:
 *     tags: [Users]
 *     summary: Soft delete a user (ROLE_ADMIN and above)
 *     description: >
 *       Sets `status` to `DELETED`, stamps `deletedAt` and revokes every
 *       session. **The row is kept**, because orders, reviews and audit trails
 *       reference it - removing it would leave dangling references and rewrite
 *       history. The email stays claimed, so the address cannot be
 *       re-registered by someone else and inherit the previous person's
 *       footprint.
 *
 *
 *       Reversible: `PATCH /users/{id}/status` with `ACTIVE` restores the
 *       account and clears `deletedAt`. For irreversible removal see
 *       `DELETE /users/{id}/permanent`.
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdPath'
 *     responses:
 *       200:
 *         description: User soft deleted.
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
 *       400:
 *         description: You cannot delete your own account.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409:
 *         description: Already deleted, or this is the last remaining owner.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /users/{id}/permanent:
 *   delete:
 *     tags: [Users]
 *     summary: Permanently delete a user (owner only)
 *     description: >
 *       **Irreversible.** Removes the document from the database outright.
 *
 *
 *       Owner-only and on its own path rather than a `?force=true` flag,
 *       because an irreversible action should be impossible to trigger by
 *       fumbling a query parameter. Anything referencing this user by id
 *       becomes a dangling reference, which is exactly why the soft delete is
 *       the default and this is reserved for erasure requests and genuine
 *       mistakes.
 *
 *
 *       Unlike the soft delete, this frees the email address for reuse.
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdPath'
 *     responses:
 *       200:
 *         description: User permanently deleted. Only what was removed is returned.
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
 *                         deleted:
 *                           type: object
 *                           properties:
 *                             id: { type: integer, example: 1003 }
 *                             email: { type: string, format: email }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *
 * /users/{id}/role:
 *   patch:
 *     tags: [Users]
 *     summary: Change a user's role
 *     description: >
 *       Requires **`ROLE_ADMIN` or above** (admins and owners), and is guarded
 *       three ways: you cannot change your own role, you cannot assign a role
 *       at or above your own rank, and you cannot modify a user senior to you.
 *       So an admin may create moderators but never another admin, and only an
 *       owner mints owners. The last remaining owner cannot be demoted.
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
 *     summary: Suspend or reactivate an account
 *     description: >
 *       Requires `ROLE_ADMIN` or above. Suspending revokes every session the
 *       user holds; reactivating clears `deletedAt`, so this is also how a
 *       soft-deleted account is restored.
 *
 *
 *       Only `ACTIVE` and `SUSPENDED` are accepted. `DELETED` is reachable
 *       solely through `DELETE /users/{id}`, so a removal always goes through
 *       the code that stamps the deletion time.
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdPath'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [ACTIVE, SUSPENDED] }
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
