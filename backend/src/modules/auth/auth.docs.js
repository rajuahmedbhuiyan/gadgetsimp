"use strict";

/**
 * OpenAPI description of the auth routes. Documentation only - not required
 * at runtime. Kept beside auth.routes.js so the two are edited together.
 */

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Step 1 of signup - request an email confirmation
 *     description: >
 *       **No account is created by this call.** The details are held in a
 *       pending record and a confirmation link is emailed. The account exists
 *       only after `POST /auth/verify-email` succeeds, which means the users
 *       collection never contains unverified or unreachable accounts.
 *
 *
 *       Returns `202 Accepted` with no user and no tokens. The response is
 *       deliberately identical whether or not the address is already
 *       registered - anything else would let a caller test which emails have
 *       accounts. If it was already taken, the real account holder is emailed
 *       a notice instead.
 *
 *
 *       The emailed link is valid for **10 minutes**. It is a bearer credential
 *       that creates an account, so the window is deliberately narrow; if it
 *       lapses, `POST /auth/resend-verification` issues a fresh one. Expired
 *       signups are removed automatically, releasing the address.
 *       Limited to 5 registrations per hour per IP.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, email, password]
 *             properties:
 *               firstName: { type: string, maxLength: 60, example: Raju }
 *               lastName: { type: string, maxLength: 60, example: Ahmed }
 *               email: { type: string, format: email, example: raju@example.com }
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: At least 8 characters with an uppercase letter, a lowercase letter and a digit.
 *                 example: Str0ngPass
 *               phone: { type: string, example: "+8801712345678" }
 *     responses:
 *       202:
 *         description: Confirmation email sent (or silently skipped if the address was taken).
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
 *                         email: { type: string, format: email }
 *             example:
 *               success: true
 *               message: Check your inbox. We have sent a link to confirm your email address - your account is created once you confirm.
 *               data: { email: raju@example.com }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *
 * /auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Step 2 of signup - confirm the email
 *     description: >
 *       Consumes the token from the emailed link. **What happens next depends
 *       on how the signup started, and a client must handle both.**
 *
 *
 *       **Normal signup** (the password was chosen up front): the account is
 *       created and the user is signed straight in - they clicked the link
 *       seconds ago, so asking for the password again would add nothing.
 *       Answers **201** with the usual auth payload.
 *
 *
 *       **Guest-checkout signup** (`createAccount: true` on `POST /orders`,
 *       where there never was a password field): the address is confirmed and
 *       nothing else. Answers **200** with **`code: "REQUIRED_PASSWORD"`** and
 *       a `registrationToken`, and deliberately **no session** - a link that
 *       arrived by email proves only mailbox access, and treating it as a login
 *       would make a forwarded message an account takeover. Collect a password
 *       and post it with that token to `POST /auth/complete-registration`.
 *
 *
 *       Branch on the top-level `code`, not on the status: it is the field that
 *       says which of the two happened.
 *
 *
 *       The token is single use in both cases. Replaying a link that has
 *       already been used returns `400 VERIFICATION_TOKEN_INVALID`, because the
 *       pending record is either deleted or its token rotated. Only a SHA-256
 *       hash of the token is stored, so a database dump cannot be used to
 *       confirm someone else's address.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 description: The `token` query parameter from the emailed link.
 *                 example: 8Kd2nQ7pR4sT6vXyZ1aB3cD5eF7gH9jK0lM2nO4pQ6s
 *     responses:
 *       201:
 *         description: Account created and signed in. Refresh token set as an httpOnly cookie.
 *         headers:
 *           Set-Cookie:
 *             schema: { type: string }
 *             description: 'gs_refresh_token=<jwt>; HttpOnly; SameSite=Lax; Path=/api/v1/auth'
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthPayload' }
 *       200:
 *         description: >
 *           Guest-checkout signup: the email is confirmed but a password is
 *           still needed. Carries `code: "REQUIRED_PASSWORD"` and **no
 *           session**. Open a password modal and post to
 *           `/auth/complete-registration` with the `registrationToken`.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     code: { type: string, enum: [REQUIRED_PASSWORD], example: REQUIRED_PASSWORD }
 *                     data:
 *                       type: object
 *                       properties:
 *                         registrationToken:
 *                           type: string
 *                           description: Post this back with the chosen password. Valid for 30 minutes.
 *                           example: 4bR7tY2wQ9zX1cV3bN5mK8jH0gF6dS4aP2oI7uY5tR3
 *                         email: { type: string, example: rahim@example.com }
 *                         firstName: { type: string, example: Rahim }
 *                         lastName: { type: string, example: Uddin }
 *             example:
 *               success: true
 *               statusCode: 200
 *               message: Email confirmed. Choose a password to finish creating your account.
 *               code: REQUIRED_PASSWORD
 *               data:
 *                 registrationToken: 4bR7tY2wQ9zX1cV3bN5mK8jH0gF6dS4aP2oI7uY5tR3
 *                 email: rahim@example.com
 *                 firstName: Rahim
 *                 lastName: Uddin
 *       400:
 *         description: Token invalid, already used, or expired.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               statusCode: 400
 *               message: This verification link is invalid or has already been used.
 *               code: VERIFICATION_TOKEN_INVALID
 *               errors: []
 *       409: { $ref: '#/components/responses/Conflict' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *
 * /auth/complete-registration:
 *   post:
 *     tags: [Auth]
 *     summary: Step 3 - set a password for a guest-checkout signup
 *     description: >
 *       Finishes the account that `POST /orders` offered to create. Takes the
 *       `registrationToken` returned by `/auth/verify-email` alongside
 *       `code: "REQUIRED_PASSWORD"`, plus the password the customer just chose.
 *
 *
 *       **No second verification email.** The address was confirmed minutes ago
 *       by the call that issued this token; asking again would be theatre. The
 *       session is issued here, because this is the point the user proved
 *       knowledge of a secret they chose - not merely access to a mailbox.
 *
 *
 *       Creating the account also **attaches the guest orders placed with that
 *       address** to it, which is what makes the purchase that prompted the
 *       signup appear in their order history rather than an empty list.
 *
 *
 *       The token from the verification email itself will not work here: the
 *       address has to be proven first, and `verify-email` rotates the token
 *       when it does. That ordering is what stops the emailed link being spent
 *       directly on account creation, skipping the verification it exists to
 *       perform.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:
 *                 type: string
 *                 description: The `registrationToken` from `/auth/verify-email`. Valid for 30 minutes.
 *                 example: 4bR7tY2wQ9zX1cV3bN5mK8jH0gF6dS4aP2oI7uY5tR3
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: At least 8 characters with an uppercase letter, a lowercase letter and a digit.
 *                 example: Str0ngPass
 *           example:
 *             token: 4bR7tY2wQ9zX1cV3bN5mK8jH0gF6dS4aP2oI7uY5tR3
 *             password: Str0ngPass
 *     responses:
 *       201:
 *         description: Account created and signed in. Refresh token set as an httpOnly cookie.
 *         headers:
 *           Set-Cookie:
 *             schema: { type: string }
 *             description: 'gs_refresh_token=<jwt>; HttpOnly; SameSite=Lax; Path=/api/v1/auth'
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthPayload' }
 *       400:
 *         description: >
 *           Token invalid or expired (`REGISTRATION_TOKEN_INVALID`,
 *           `REGISTRATION_TOKEN_EXPIRED`), the address was never confirmed
 *           (`EMAIL_NOT_VERIFIED`), or this signup already has a password
 *           (`PASSWORD_ALREADY_SET`).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *
 * /auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Send a fresh confirmation link
 *     description: >
 *       Issues a new token and invalidates the previous one, so a forwarded or
 *       intercepted older email stops working. This is the recovery path when
 *       a 10-minute link lapses before the user reaches their inbox.
 *
 *
 *       Always answers 200, whether or not a pending signup exists. Capped at
 *       5 resends per signup with a 60 second cooldown between them, and
 *       limited to 5 requests per hour per caller - this endpoint sends mail
 *       to an address the caller names, so it is the obvious one to abuse for
 *       spamming a third party's inbox.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: raju@example.com }
 *     responses:
 *       200:
 *         description: Accepted. Says nothing about whether the address exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       429:
 *         description: Cooldown active, per-signup resend cap reached, or tier limit hit.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /auth/social-login:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in or sign up with Facebook or Google
 *     description: >
 *       One endpoint for every social provider, discriminated by `type`. It
 *       covers both signing up and signing in - the user taps a button and
 *       expects to end up signed in either way, so the response does not say
 *       which happened.
 *
 *
 *       **What to send as `token` depends on the provider**, because the two
 *       vendors hand the browser different things:
 *
 *
 *       - `FACEBOOK` - the opaque **user access token** from `FB.login()`.
 *       - `GOOGLE` - the **ID token** (the `credential` field) from Google
 *         Identity Services. This is a JWT and runs well over 1KB.
 *
 *
 *       **The token is verified server-side and never trusted as presented.**
 *       Facebook tokens are checked against Graph `debug_token`; Google ID
 *       tokens have their signature verified against Google's public keys.
 *       Both verify that the token was issued to *this* application - without
 *       that audience check, a token from any other app could be replayed
 *       here to sign in as that user.
 *
 *
 *       There is no email-verification step on this route: the provider has
 *       already verified the address, which is the point of delegating
 *       identity. A Google account whose email is not verified is rejected.
 *
 *
 *       If an account already exists for the same address, the provider is
 *       **linked** to it rather than creating a duplicate, and the user can
 *       then sign in by any linked method. If the provider shares no email
 *       (a Facebook user who registered by phone, or declined the
 *       permission), the request fails with `SOCIAL_EMAIL_MISSING` and the
 *       client should fall back to email signup.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, token]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [FACEBOOK, GOOGLE]
 *               token:
 *                 type: string
 *                 description: Access token (Facebook) or ID token (Google).
 *                 example: eyJhbGciOiJSUzI1NiIsImtpZCI6IjE...
 *           examples:
 *             google:
 *               summary: Google Identity Services
 *               value: { type: GOOGLE, token: eyJhbGciOiJSUzI1NiIsImtpZCI6...  }
 *             facebook:
 *               summary: Facebook JS SDK
 *               value: { type: FACEBOOK, token: EAAGm0PX4ZCpsBA... }
 *     responses:
 *       200:
 *         description: Signed in. An account is created on first use.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthPayload' }
 *       400:
 *         description: The provider shared no email address.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               statusCode: 400
 *               message: Facebook did not share an email address with us. Please grant email permission, or sign up with your email instead.
 *               code: SOCIAL_EMAIL_MISSING
 *               errors: []
 *       401:
 *         description: >
 *           Token invalid, expired, issued to a different application
 *           (`SOCIAL_TOKEN_WRONG_AUDIENCE`), or - for Google - attached to an
 *           unverified email (`SOCIAL_EMAIL_UNVERIFIED`).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       503:
 *         description: That provider is not configured on this server.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               statusCode: 503
 *               message: GOOGLE sign-in is not configured on this server
 *               code: SOCIAL_PROVIDER_NOT_CONFIGURED
 *               errors: []
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *
 * /auth/providers:
 *   get:
 *     tags: [Auth]
 *     summary: List the sign-in methods this server supports
 *     description: >
 *       Reflects what is actually configured, so a frontend renders only the
 *       buttons that will work rather than a Google button that returns 503.
 *     security: []
 *     responses:
 *       200:
 *         description: Available providers.
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
 *                         providers:
 *                           type: array
 *                           items: { type: string, enum: [EMAIL, FACEBOOK, GOOGLE] }
 *             example:
 *               success: true
 *               statusCode: 200
 *               message: Available sign-in providers
 *               data: { providers: [EMAIL, GOOGLE] }
 *
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in with email and password
 *     description: >
 *       Returns an access token in the body and sets the refresh token cookie.
 *       Rate limited to 10 **failed** attempts per 15 minutes, keyed on IP and
 *       submitted email; successful sign-ins do not consume the budget.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: raju@example.com }
 *               password: { type: string, example: Str0ngPass }
 *     responses:
 *       200:
 *         description: Signed in.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthPayload' }
 *       401:
 *         description: >
 *           Invalid credentials. Deliberately identical whether the email is
 *           unknown or the password is wrong, so the endpoint cannot be used
 *           to discover which addresses are registered.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate the session and get a fresh access token
 *     description: >
 *       Reads the `gs_refresh_token` cookie - or, for a client that cannot hold
 *       cookies, a `refreshToken` in the body - invalidates it and issues a new
 *       pair. The cookie wins if both are sent. Presenting a refresh token that was already rotated is treated
 *       as theft: every session for that user is terminated and the response
 *       is 401 `REFRESH_TOKEN_REUSED`.
 *     security: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Only needed by clients that cannot send the cookie.
 *     responses:
 *       200:
 *         description: New access token issued and refresh cookie rotated.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthPayload' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Sign out of the current device
 *     description: Removes this session only. Other devices stay signed in.
 *     responses:
 *       200:
 *         description: Signed out and refresh cookie cleared.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *
 * /auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Sign out of every device
 *     description: >
 *       Bumps the user's token version, which immediately invalidates all
 *       outstanding access tokens as well as stored refresh sessions.
 *     responses:
 *       200:
 *         description: All sessions terminated.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *
  * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset link
 *     description: >
 *       Emails a single-use reset link, valid for **10 minutes**. Issuing a new
 *       link invalidates any previous one.
 *
 *
 *       Always answers 200, whether or not the address has an account - a
 *       different response would make this a free membership oracle, which
 *       would undo the care taken over login and signup.
 *
 *
 *       A social-only account may reset too: they own the address, and it
 *       gives them a password to use alongside Google or Facebook. Limited to
 *       5 requests per hour, since it sends mail to an address the caller names.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: raju@example.com }
 *     responses:
 *       200:
 *         description: Accepted. Says nothing about whether the address exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Set a new password using an emailed token
 *     description: >
 *       Consumes the token from the reset email. The token is single use, and
 *       only its SHA-256 hash is stored, so a database dump cannot be used to
 *       seize accounts.
 *
 *
 *       On success **every session is revoked** - a reset is the standard
 *       response to a suspected compromise, so leaving other devices signed in
 *       would defeat the purpose. A notification email is sent, which is what
 *       lets a victim notice a takeover.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *                 description: The `token` query parameter from the emailed link.
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 description: At least 8 characters with an uppercase letter, a lowercase letter and a digit.
 *                 example: BrandNewP4ss
 *     responses:
 *       200:
 *         description: Password reset; all sessions signed out.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       400:
 *         description: Token invalid, already used, or expired.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               statusCode: 400
 *               message: This reset link is invalid or has already been used.
 *               code: RESET_TOKEN_INVALID
 *               errors: []
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change the current password
 *     description: >
 *       Requires the current password. On success every session is terminated,
 *       so the client must sign in again. Limited to 5 attempts per hour.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, example: Str0ngPass }
 *               newPassword: { type: string, example: EvenStr0nger1 }
 *     responses:
 *       200:
 *         description: Password changed; all sessions signed out.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the signed-in user
 *     responses:
 *       200:
 *         description: Current user.
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
 */
