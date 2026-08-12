"use strict";

/**
 * OpenAPI description of the media routes. Documentation only.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     Media:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Sequential integer id, from the same counter as users.
 *           example: 1004
 *         publicId:
 *           type: string
 *           description: Cloudinary identifier, and the only value needed to delete the asset.
 *           example: gadgetsimp/xk4pq2mn9
 *         url: { type: string, format: uri, example: https://res.cloudinary.com/demo/image/upload/v1/gadgetsimp/xk4pq2mn9.png }
 *         type: { type: string, enum: [IMAGE], example: IMAGE }
 *         format:
 *           type: string
 *           description: Always `webp` - every upload is re-encoded before storage.
 *           example: webp
 *         bytes:
 *           type: integer
 *           description: Size of the stored WebP, after conversion.
 *           example: 84320
 *         originalFormat:
 *           type: string
 *           description: What was uploaded, before conversion.
 *           example: jpeg
 *         originalBytes:
 *           type: integer
 *           description: Size as uploaded. Compare with `bytes` to see the saving.
 *           example: 184320
 *         animated:
 *           type: boolean
 *           description: True for animated GIFs, which become animated WebP rather than being flattened.
 *           example: false
 *         width: { type: integer, example: 1200 }
 *         height: { type: integer, example: 800 }
 *         originalFilename: { type: string, example: holiday-photo.png }
 *         uploadedBy:
 *           type: integer
 *           description: Integer id of the uploading user.
 *           example: 1003
 *         tag:
 *           type: string
 *           nullable: true
 *           description: Free-form label for grouping, e.g. avatar or banner.
 *           example: avatar
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 * /media/upload:
 *   post:
 *     tags: [Media]
 *     summary: Upload a file
 *     description: >
 *       `multipart/form-data` with the file on a field named `file`. Open to
 *       any authenticated role - a customer needs it for their own profile
 *       picture. Deleting and listing everything are the privileged operations.
 *
 *
 *       **Maximum 3MB.** The limit is enforced while the request streams, so an
 *       oversized upload is rejected with `413 FILE_TOO_LARGE` without ever
 *       being buffered - the difference between a cheap rejection and a way to
 *       exhaust the process.
 *
 *
 *       Allowed types are `image/jpeg`, `image/png`, `image/webp`, `image/gif`
 *       and `image/avif` - an explicit list, not an `image/*` wildcard, because
 *       that wildcard admits SVG, which can carry script and becomes stored XSS
 *       when served back from your own domain. The declared Content-Type is
 *       only a first pass; Cloudinary decodes the file and rejects anything
 *       that is not really the image it claims to be.
 *
 *
 *       **Every image is converted to WebP before storage**, at quality 80 and
 *       capped at 2000px on the longest edge (downscale only - a small avatar
 *       is never blown up). Typical savings run 25-65% against the original;
 *       an oversized phone photo can drop far further. The response reports
 *       `originalFormat` and `originalBytes` alongside the stored `bytes`, so
 *       the saving is visible. Animated GIFs become animated WebP rather than
 *       being flattened to one frame.
 *
 *
 *       The conversion is also the real type check. A `Content-Type` header is
 *       client-supplied and forged in a second, so the decode is what actually
 *       establishes a file is an image - anything undecodable is rejected with
 *       `400 INVALID_IMAGE` before it is stored. Re-encoding additionally
 *       strips EXIF (which routinely carries the GPS coordinates of where a
 *       photo was taken) and destroys anything smuggled into the original's
 *       metadata or trailing bytes.
 *
 *
 *       On success the asset is stored in Cloudinary **and** a record is
 *       written here with a new integer `id`. If the record cannot be written
 *       the asset is deleted again, so a failure never leaves an unreferenced
 *       file accruing storage cost.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The file. 3MB maximum.
 *               tag:
 *                 type: string
 *                 maxLength: 40
 *                 description: Optional label for grouping.
 *                 example: avatar
 *     responses:
 *       201:
 *         description: Uploaded and recorded.
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
 *                         media: { $ref: '#/components/schemas/Media' }
 *       400:
 *         description: No file sent, a disallowed type, or bytes that are not a readable image.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               statusCode: 400
 *               message: "Unsupported file type 'application/pdf'. Allowed: image/jpeg, image/png, image/webp, image/gif, image/avif"
 *               code: UNSUPPORTED_MEDIA_TYPE
 *               errors: []
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       413:
 *         description: File exceeds the 3MB limit.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               statusCode: 413
 *               message: File is too large. The maximum size is 3MB.
 *               code: FILE_TOO_LARGE
 *               errors:
 *                 - field: file
 *                   message: Must be 3MB or smaller
 *       502:
 *         description: The storage provider rejected or could not accept the file.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       503:
 *         description: Cloudinary is not configured on this server.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /media/my:
 *   post:
 *     tags: [Media]
 *     summary: List your own uploads
 *     description: >
 *       Any authenticated role. The uploader is pinned from the access token,
 *       not read from the body, so there is no field to tamper with - and
 *       `uploadedBy` is not part of this schema at all, so sending it is a 422
 *       rather than something that looks like it might work.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MediaFilter'
 *           examples:
 *             all:
 *               summary: First page, newest first
 *               value: {}
 *             avatars:
 *               summary: Only avatars, oldest first
 *               value: { tag: avatar, sortOrder: asc }
 *     responses:
 *       200:
 *         description: Paginated media.
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
 *                         media:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/Media' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /media/filter:
 *   post:
 *     tags: [Media]
 *     summary: List every user's uploads
 *     description: >
 *       Requires **`ROLE_ADMIN` or above** (so admins and owners). Same filter
 *       shape as `/media/my`, plus `uploadedBy` to narrow to one uploader.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/MediaFilter'
 *               - type: object
 *                 properties:
 *                   uploadedBy:
 *                     type: integer
 *                     description: Narrow to a single uploader's files.
 *                     example: 1003
 *     responses:
 *       200:
 *         description: Paginated media.
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
 *                         media:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/Media' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *
 * /media/{id}:
 *   delete:
 *     tags: [Media]
 *     summary: Delete a file
 *     description: >
 *       Requires **`ROLE_ADMIN` or above**. Removes the asset from Cloudinary
 *       and then the record here.
 *
 *
 *       That order is deliberate: if the record were deleted first and the
 *       remote delete then failed, the file would be stranded with nothing
 *       pointing at it. This way a provider failure leaves both sides intact
 *       and the call can simply be retried.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *         description: Integer media id.
 *         example: 1004
 *     responses:
 *       200:
 *         description: Deleted. Only what was removed is returned.
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
 *                             id: { type: integer, example: 1004 }
 *                             publicId: { type: string, example: gadgetsimp/xk4pq2mn9 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     MediaFilter:
 *       type: object
 *       description: Shared filter body for the media listing endpoints.
 *       properties:
 *         page: { type: integer, minimum: 1, default: 1 }
 *         limit: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *         search:
 *           type: string
 *           description: >
 *             Matches the original filename. Regex metacharacters are escaped
 *             and treated as literal text.
 *           example: holiday
 *         type: { type: string, enum: [IMAGE] }
 *         tag:
 *           oneOf:
 *             - type: string
 *             - type: array
 *               items: { type: string }
 *           example: avatar
 *         format:
 *           type: string
 *           description: Always `webp` - every upload is re-encoded before storage.
 *           example: webp
 *         minBytes: { type: integer, example: 1024 }
 *         maxBytes: { type: integer, example: 3145728 }
 *         createdFrom: { type: string, format: date-time }
 *         createdTo: { type: string, format: date-time }
 *         sortBy:
 *           type: string
 *           enum: [createdAt, bytes, originalFilename]
 *           default: createdAt
 *         sortOrder: { type: string, enum: [asc, desc], default: desc }
 */
