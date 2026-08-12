"use strict";

/**
 * Reusable OpenAPI components.
 *
 * Every schema, parameter and response that more than one module needs lives
 * here and is referenced with `$ref`. Module `*.docs.js` files then describe
 * only what is genuinely specific to their endpoints, which keeps the
 * per-route YAML short enough that people actually maintain it.
 *
 * This file is documentation only - it exports nothing and is never required
 * at runtime. swagger-jsdoc reads it as source text.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean, example: true }
 *         statusCode:
 *           type: integer
 *           description: >
 *             The HTTP status, repeated in the body. Redundant over plain
 *             HTTP, but it survives a logged payload, a webhook relay, or a
 *             client whose HTTP wrapper only returns the parsed JSON. Errors
 *             carry the same field.
 *           example: 200
 *         message: { type: string, example: Success }
 *         data: { type: object, nullable: true }
 *       required: [success, statusCode, message]
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean, example: false }
 *         statusCode: { type: integer, example: 422 }
 *         message: { type: string, example: Request validation failed }
 *         code:
 *           type: string
 *           description: Stable machine-readable code. Branch on this, not on the message.
 *           example: VALIDATION_ERROR
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               field: { type: string, example: body.email }
 *               message: { type: string, example: Enter a valid email address }
 *         requestId:
 *           type: string
 *           description: Echoed as the X-Request-Id header. Quote it in bug reports.
 *           example: 3f8c1e0a-6a1b-4f2e-9a1e-2b7d5c9f0a11
 *       required: [success, statusCode, message, code]
 *
 *     PaginationMeta:
 *       type: object
 *       properties:
 *         page: { type: integer, example: 1 }
 *         limit: { type: integer, example: 20 }
 *         total: { type: integer, example: 137 }
 *         totalPages: { type: integer, example: 7 }
 *         hasNextPage: { type: boolean, example: true }
 *         hasPrevPage: { type: boolean, example: false }
 *
 *     Role:
 *       type: string
 *       enum: [ROLE_CUSTOMER, ROLE_MODERATOR, ROLE_ADMIN, ROLE_OWNER]
 *       description: >
 *         Roles are ranked, and permissions accumulate upwards:
 *         `ROLE_CUSTOMER` < `ROLE_MODERATOR` < `ROLE_ADMIN` < `ROLE_OWNER`.
 *         An endpoint documented as requiring `ROLE_ADMIN` also admits
 *         `ROLE_OWNER`. Nobody may assign a role at or above their own rank.
 *       example: ROLE_CUSTOMER
 *
 *     UserStatus:
 *       type: string
 *       enum: [ACTIVE, SUSPENDED, DELETED]
 *       default: ACTIVE
 *       description: >
 *         Account lifecycle. `SUSPENDED` and `DELETED` both block sign-in and
 *         revoke existing sessions; the difference is intent and reversibility.
 *         `DELETED` is set only by `DELETE /users/{id}` (soft delete), never by
 *         the status endpoint, so a removal always goes through the code that
 *         stamps `deletedAt`.
 *       example: ACTIVE
 *
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Sequential integer id, assigned from an atomic counter.
 *           example: 1003
 *         firstName: { type: string, example: Raju }
 *         lastName: { type: string, example: Ahmed }
 *         fullName:
 *           type: string
 *           readOnly: true
 *           description: Derived from firstName and lastName.
 *           example: Raju Ahmed
 *         email: { type: string, format: email, example: raju@example.com }
 *         role: { $ref: '#/components/schemas/Role' }
 *         authProviders:
 *           type: array
 *           description: >
 *             Every way this account can sign in. An account created with a
 *             password that later links Facebook carries both and can use
 *             either. A Facebook-only account has no password, so
 *             `/auth/change-password` returns `PASSWORD_NOT_SET` for it.
 *           items: { type: string, enum: [EMAIL, FACEBOOK] }
 *           example: [EMAIL]
 *         phone: { type: string, example: "+8801712345678" }
 *         image:
 *           type: string
 *           nullable: true
 *           description: Profile picture URL.
 *           example: https://cdn.gadgetsimp.dev/u/1003.jpg
 *         status: { $ref: '#/components/schemas/UserStatus' }
 *         deletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Set by the soft delete; cleared when the account is restored.
 *         emailVerifiedAt:
 *           type: string
 *           format: date-time
 *           description: Always set - an account only exists once its email is confirmed.
 *         lastLoginAt: { type: string, format: date-time, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     AuthPayload:
 *       type: object
 *       properties:
 *         user: { $ref: '#/components/schemas/User' }
 *         accessToken:
 *           type: string
 *           description: >
 *             Short-lived JWT. Send as `Authorization: Bearer <token>`.
 *             The matching refresh token is delivered as an httpOnly cookie
 *             and is never present in the body.
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *
 *   parameters:
 *     PageParam:
 *       in: query
 *       name: page
 *       schema: { type: integer, minimum: 1, default: 1 }
 *       description: 1-based page number.
 *     LimitParam:
 *       in: query
 *       name: limit
 *       schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       description: Items per page. Values above 100 are clamped.
 *     SortParam:
 *       in: query
 *       name: sort
 *       schema: { type: string }
 *       description: >
 *         Comma-separated fields, `-` for descending (e.g. `-createdAt,price`).
 *         Only fields on the endpoint's allow-list are honoured; others are ignored.
 *     SearchParam:
 *       in: query
 *       name: search
 *       schema: { type: string }
 *       description: Full-text search term. Subject to the stricter search rate limit tier.
 *     ObjectIdPath:
 *       in: path
 *       name: id
 *       required: true
 *       schema: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
 *       description: 24-character MongoDB ObjectId (catalog resources).
 *     UserIdPath:
 *       in: path
 *       name: id
 *       required: true
 *       schema: { type: integer, minimum: 1 }
 *       description: Integer user id.
 *       example: 1003
 *
 *   responses:
 *     BadRequest:
 *       description: Malformed request.
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *     Unauthorized:
 *       description: Missing, invalid, expired or revoked access token.
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *           example:
 *             success: false
 *             statusCode: 401
 *             message: Authentication required
 *             code: TOKEN_MISSING
 *             errors: []
 *     Forbidden:
 *       description: Authenticated, but not allowed to perform this action.
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *     NotFound:
 *       description: Resource does not exist.
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *     Conflict:
 *       description: Conflicts with existing state, e.g. a duplicate unique field.
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *     ValidationError:
 *       description: Request failed schema validation.
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *           example:
 *             success: false
 *             statusCode: 422
 *             message: Request validation failed
 *             code: VALIDATION_ERROR
 *             errors:
 *               - field: body.password
 *                 message: Password must contain an uppercase letter
 *     TooManyRequests:
 *       description: Rate limit for this tier exhausted.
 *       headers:
 *         RateLimit:
 *           schema: { type: string }
 *           description: 'Combined RFC draft-8 policy header, e.g. `limit=120, remaining=0, reset=43`.'
 *         Retry-After:
 *           schema: { type: integer }
 *           description: Seconds to wait before retrying.
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *           example:
 *             success: false
 *             statusCode: 429
 *             message: Too many failed attempts. Please try again in 15 minutes.
 *             code: RATE_LIMIT_EXCEEDED
 *             errors:
 *               - field: request
 *                 message: Retry after 900 seconds.
 */
