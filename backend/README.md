# GadgetSimp Commerce API

Express 5 + MongoDB backend for the GadgetSimp storefront. Modular monolith,
tiered rate limiting, OpenAPI docs generated from the code.

**Implemented:** auth, users, media, catalog (attributes, categories, brands, products, variants, filtering/facets).
**Not yet built:** cart, orders, reviews —
each drops in as one folder under `src/modules/` plus one line in
`src/routes/index.js`.

## Quick start

```bash
cp .env.example .env          # then fill in the two JWT secrets
npm install
npm run seed                  # optional: one account per role
npm run dev
```

- API — <http://localhost:4000/api/v1>
- **Swagger UI — <http://localhost:4000/api/v1/docs>**
- Raw spec — <http://localhost:4000/api/v1/docs.json>

Requires a MongoDB instance at `MONGODB_URI`. Seeded logins (all pre-verified,
ids from 1000):

| Email | Password | Role |
| --- | --- | --- |
| `owner@gadgetsimp.dev` | `Owner1234` | `ROLE_OWNER` |
| `admin@gadgetsimp.dev` | `Admin1234` | `ROLE_ADMIN` |
| `moderator@gadgetsimp.dev` | `Moderator1234` | `ROLE_MODERATOR` |
| `customer@gadgetsimp.dev` | `Customer1234` | `ROLE_CUSTOMER` |

```bash
npm test              # 283 tests, in-memory MongoDB, no external services
npm run docs:export   # write openapi.json for client generation / CI diffing
```

## Architecture

Feature-first (vertical slices), not layer-first. Everything about a feature
lives in its own folder, so a change touches one directory instead of reaching
into four sibling ones.

```
src/
├── server.js            process lifecycle: connect → build app → index → listen → drain
├── app.js               express assembly; middleware order is the load-bearing part
├── config/              env validation, logger, mongo, redis, swagger
├── middleware/          rate limiters, auth, validate, sanitize, error handler
├── shared/              ApiError, response envelope, query builder, tokens
├── modules/<feature>/   model · validation · service · controller · routes · docs
├── routes/index.js      the module table + /health
└── docs/components.js   reusable OpenAPI components
```

Each module is six files with one job apiece:

| File | Responsibility |
| --- | --- |
| `*.model.js` | Mongoose schema, indexes, virtuals |
| `*.validation.js` | Zod schemas for body / query / params |
| `*.service.js` | Business rules. No `req`/`res` — callable from a worker or CLI |
| `*.controller.js` | Read validated input, call service, send response |
| `*.routes.js` | Wire middleware in order |
| `*.docs.js` | OpenAPI JSDoc, beside the routes it documents |

**Request flow**

```
request → requestId/log → helmet → cors → body parse → sanitize
        → global limiter → tier limiter → validate → authenticate
        → authorize → controller → service → model
                                        ↓
                    ApiError ─────→ errorHandler → JSON envelope
```

Rate limiting comes before validation and auth deliberately: a flood should be
rejected before it costs a schema parse or a bcrypt comparison.

### Decisions worth knowing

**Pages are zero-based.** The first page is `page: 0`, so `skip = page * limit`
with no off-by-one correction, and it matches what table components on the
frontend expect. `hasNextPage` is `page + 1 < totalPages` — on the last page
those differ, and the naive check would promise a page that isn't there.

**One response envelope.** Success and failure share a shape, so the frontend
writes one parser rather than one per endpoint. Errors carry a stable `code` —
branch on that, never on the message.

```json
{ "success": true,  "statusCode": 200, "message": "Products retrieved", "data": {}, "meta": {} }
{ "success": false, "statusCode": 429, "message": "…", "code": "RATE_LIMIT_EXCEEDED", "errors": [], "requestId": "…" }
```

`statusCode` is repeated in the body on both branches. It is redundant over
plain HTTP, but it survives a logged payload, a webhook relay, or a client
whose HTTP wrapper only hands back the parsed JSON.

**Services throw, one place catches.** Controllers have no try/catch: Express 5
forwards rejected promises to the error middleware on its own, so no
`catchAsync` wrapper is needed. `errorHandler` translates Zod, Mongoose, Mongo
and JWT failures into honest status codes, and refuses to leak anything it does
not recognise.

**Users are keyed by integer, catalog resources by ObjectId.** User ids come
from an atomic `$inc` on a counter document — the increment and read happen in
one server-side operation, so concurrent signups can never collide. The
trade-off is that sequential ids are guessable and leak volume, so anything
exposed by id is authorised on ownership rather than obscurity, and probing a
neighbouring id returns 404 rather than 403.

**Indexes are built explicitly at boot.** Mongoose's `autoIndex` is not awaited
and is skipped entirely when `bufferCommands` is off, which silently leaves a
database with nothing but `_id_` — no unique email constraint, no text search.
`ensureIndexes()` runs after models register and before the socket opens;
`tests/indexes.test.js` asserts the real index set.

## Catalog

The catalog follows the same vertical-module flow as the rest of the API. The
Attribute Library owns reusable metadata; categories select those attributes
and decide which are filterable or eligible to generate variants. Brands are
global entities. Products store product-level attributes, while purchasable
SKUs live in the separate `variants` collection.

Complex reads use request bodies and remain public:

```text
POST /products/filter          search, filters, sorting, zero-based pagination
POST /products/filter-options  category-driven options and database facet counts
POST /categories/filter        public category discovery
POST /brands/filter            public brand discovery
```

Filter fields are resolved from Attribute metadata rather than hardcoded
names. Values inside one filter use OR semantics; different filters are ANDed.
MongoDB aggregation performs filtering and counts without loading the catalog
into application memory. Product creation generates the Cartesian product of
selected variant options and writes the product and SKUs in a transaction on
replica-set/Atlas deployments.

**The seed refuses non-local databases.** It deletes before it writes, and
`NODE_ENV=development` pointed at a shared Atlas cluster looks perfectly safe
right until it erases everyone's data. Non-local targets need
`SEED_CONFIRM=yes`.

## Rate limiting

Tiers by what abuse actually costs, each with its own counter namespace.
Configured in [`src/middleware/rateLimiter.js`](src/middleware/rateLimiter.js).

| Tier | Budget | Applied to |
| --- | --- | --- |
| `global` | 900 / 15 min | every API route, as a backstop |
| `read` | 120 / min | reads, including the user filter |
| `write` | 40 / min | mutations |
| `auth` | 10 **failures** / 15 min | login, refresh |
| `register` | 5 / hour | account creation |
| `sensitive` | 5 / hour | password change, forgot/reset, resend |

- **Identity over IP.** Signed-in callers are keyed by user id, so shoppers
  behind one NAT or carrier CGNAT don't share a bucket. Anonymous callers fall
  back to IP, normalised through `ipKeyGenerator` so an IPv6 client can't hop
  within its own /56 to reset the counter.
- **Failures are what count on auth.** `skipSuccessfulRequests` means correct
  logins are free; wrong passwords burn the budget.
- Every response carries `RateLimit` / `RateLimit-Policy` (RFC draft-8); a 429
  adds `Retry-After` and returns the standard error envelope.

`TRUST_PROXY_HOPS` is what makes `req.ip` — and therefore all of this —
trustworthy. Set it to the number of proxies in front of the app (`1` behind a
single Nginx/Render/Railway). Leaving it at `0` in production buckets the whole
internet under the load balancer; setting it too high lets clients spoof
`X-Forwarded-For`.

Without `REDIS_URL`, counters live in process memory: lost on restart, not
shared between instances. Set it in production and the limiters switch to a
shared store with no code change.

## Auth

### Signup is two steps — no account until the email is confirmed

```
POST /auth/register      -> 202. Writes a PendingRegistration, emails a link.
                            Creates NO user.
POST /auth/verify-email  -> 201. Consumes the token, creates the account,
                            signs the user in.
POST /auth/resend-verification
```

The emailed link is valid for **10 minutes**. It is a bearer credential that
creates an account, so the window is deliberately narrow; `resend-verification`
is the recovery path when delivery outruns it, and it invalidates the previous
link. Expiry is enforced by an explicit `expiresAt` comparison, not by the TTL
index — Mongo's TTL sweep only runs about once a minute, so the index is
housekeeping while the check is what makes the window exact.

Unverified signups are held in their own collection, never in `users`. That
keeps every row in `users` a real, reachable person, means no half-account can
log in or hold a role, and lets abandoned signups expire on their own via a
TTL index (24 h) instead of squatting on an email address forever.

- The password is **bcrypt-hashed before** the pending row is written — it is a
  real credential the moment it is typed.
- Only the **SHA-256 of the token** is stored; the raw token exists solely in
  the email. The token is single-use — a replayed link returns
  `VERIFICATION_TOKEN_INVALID`.
- `register` returns `409 EMAIL_ALREADY_REGISTERED` when the address is already
  taken. For a social-only account, the message names Google or Facebook so the
  frontend can direct the user to the correct sign-in button.
- Without `SMTP_HOST`, emails are logged rather than sent, so the flow works on
  a fresh clone with no mail account.

### Sign-in methods

`EMAIL` (password), `FACEBOOK`, `GOOGLE`. A user's `authProviders` array lists
the methods their account accepts. Email/password accounts are kept separate
from social sign-in; a social-only account may link both social providers.

```
POST /auth/social-login   { "type": "FACEBOOK" | "GOOGLE", "token": "..." }
GET  /auth/providers      -> what this deployment actually has configured
```

One endpoint covers signup and signin for every provider — the user taps a
button and expects to end up signed in either way.

**What `token` is differs by provider**, because the vendors hand the browser
different things:

| `type` | `token` | Verified by |
| --- | --- | --- |
| `FACEBOOK` | opaque **access token** from `FB.login()` | Graph `debug_token` over HTTP |
| `GOOGLE` | **ID token** (`credential`) from Google Identity Services | signature check against Google's public keys |

Each provider is one file under
[`modules/auth/providers/`](src/modules/auth/providers/) exposing
`isConfigured()` and `verifyToken()` and returning a normalised profile, so the
service never branches on which one is in play. Adding a provider is one file
plus one line in the registry.

- The token is **verified server-side and never trusted as presented**, and both
  paths check the token was issued to *this* application (Facebook's `app_id`,
  Google's `aud`). Without that audience check, a token from any other app could
  be replayed here to sign in as that user. Decoding a Google ID token without
  verifying its signature is the classic way this gets built insecurely — an
  unverified JWT is just attacker-supplied JSON.
- No email-verification step: the provider already verified the address. A
  Google account with `email_verified: false` is rejected outright.
- If the same address already belongs to an email/password account, social
  sign-in returns `409 EMAIL_LOGIN_REQUIRED` and does not link the provider.
  A social-only account may still link Google and Facebook to avoid duplicates.
- No email from the provider (Facebook user registered by phone, or declined the
  permission) → `SOCIAL_EMAIL_MISSING`; fall back to email signup.
- A social-only account has **no password**: `changePassword` returns
  `PASSWORD_NOT_SET`, while password login returns `SOCIAL_LOGIN_REQUIRED` and
  names the Google or Facebook method the user should continue with.
- An unconfigured provider returns **503 `SOCIAL_PROVIDER_NOT_CONFIGURED`**, and
  is omitted from `GET /auth/providers`.

### Email delivery

`MAIL_PROVIDER` selects the transport:

| Value | Behaviour |
| --- | --- |
| `log` (default) | Writes messages to the log, link included. No account needed — clone and register immediately. Refused when `NODE_ENV=production`. |
| `gmail` | `smtp.gmail.com` with a Google **App Password**. Free. |
| `smtp` | Any other SMTP host. |

Gmail needs an App Password, **not** your Google password — Google blocks
account passwords over SMTP. Enable 2-Step Verification, then create one at
<https://myaccount.google.com/apppasswords>.

Free Gmail sends ~500/day (Workspace ~2000). Exceeding it suspends sending for
about 24 hours, which breaks signup for everyone, so the mailer counts sends and
warns in the log at 80% of `MAIL_DAILY_QUOTA`. Connections are pooled and paced
(3/sec) because Gmail throttles clients that open connections too fast. Set
`MAIL_FROM` to the same Gmail address or Gmail rewrites the header and delivery
suffers.

### Email templates

Brand colour `#febc01`, in [`auth.emails.js`](src/modules/auth/auth.emails.js).
Email HTML is not web HTML, so these use the old techniques that still work:
tables not divs, inline styles only (Gmail strips `<style>`), a VML fallback so
the button renders in Outlook, a preheader for the inbox preview line, and a
plain-text part on every message.

Buttons are **dark ink on amber, not white**: white on `#febc01` measures
**1.69:1**, far below the 4.5:1 WCAG AA minimum — `#1a1a1a` gives 10.3:1. The
templates also declare `color-scheme: light` so iOS and Outlook dark modes
cannot invert the amber into mud.

### Password recovery

```
POST /auth/forgot-password   { email }
POST /auth/reset-password    { token, newPassword }
```

- The link is valid for **10 minutes** and is **single use**; only its SHA-256
  hash is stored, so a database dump cannot be used to seize accounts. Issuing
  a new link invalidates the previous one.
- `forgot-password` returns `404 ACCOUNT_NOT_FOUND` for an unknown email and
  `409 SOCIAL_LOGIN_REQUIRED` for a social-only account, naming the provider.
- A successful reset **revokes every session**. A reset is the standard response
  to a suspected compromise, so leaving other devices signed in defeats it.
- A **password-changed email** goes out on every change, not just user-initiated
  ones — that message is what lets a victim notice a takeover.
- A social-only account cannot request a password reset because it has no email
  password; the user is directed back to Google or Facebook.

### Creating users directly (owner only)

```
POST /users   { fullName, email, password?, role?, sendEmail? }
```

Requires **`ROLE_OWNER`** — not admin. Creating accounts outright, skipping
verification and choosing the role, is the most privileged write in the API.

- The account is created **already verified** and can sign in immediately: it is
  vouched for by the highest-privileged human in the system, so a confirmation
  round trip proves nothing their authority does not already.
- **`password` is optional.** Omitted, one is generated by
  [`generatePassword`](src/shared/generatePassword.js), emailed to the new user,
  and returned once as `generatedPassword` so the owner can relay it another
  way. A password the *caller* supplied is never echoed back — that would put a
  known secret in their logs for nothing.
- The generator draws from the CSPRNG (`crypto.randomInt`, no modulo bias),
  *guarantees* the policy classes rather than hoping for them, and excludes
  visually ambiguous characters (`0/O`, `1/l/I`) since the password gets read
  off a screen and retyped.
- The role must be **below the creator's own rank** — the same rule
  `/users/{id}/role` enforces — so an owner creates admins but not another
  owner. That means the *only* route to a second owner is the seed; if you want
  succession, relax the check in `user.service.js` deliberately.
- `sendEmail: false` creates the account silently.

> A temporary password in an inbox is a real, if bounded, exposure — mail sits in
> plain text on a server that isn't ours. Now that `/auth/reset-password` exists,
> the stronger shape is to email a one-time *set your password* link instead,
> reusing that token machinery. Small change, worth making before launch.

### Media uploads

```
POST   /media/upload   multipart/form-data, field "file"  — any signed-in role
POST   /media/my       filter body, pagination            — your own uploads
POST   /media/filter   filter body, pagination            — ROLE_ADMIN and above
DELETE /media/{id}                                        — ROLE_ADMIN and above
```

Cloudinary-backed, **3MB maximum**. The cap is enforced while the request
streams, so an oversized upload is rejected without ever being buffered — the
difference between a cheap 413 and a way to exhaust the process.

**Everything is converted to WebP before storage** ([`imageProcessor.js`](src/shared/imageProcessor.js)),
quality 80, capped at 2000px on the longest edge (downscale only). Measured:

| Input | Stored | Saving |
| --- | --- | --- |
| photo-like JPEG 1600×1200 | 1545KB → 1197KB | −23% |
| flat PNG 1600×1200 | 28KB → 3KB | −88% |
| oversized JPEG 3000×2250 | 4941KB → 1734KB | −65% (also resized to 2000×1500) |

Animated GIFs become animated WebP rather than being flattened. `originalFormat`
and `originalBytes` are kept on the record so the saving stays visible.

Size is the obvious win, but re-encoding buys two things that matter more:

- **It is the real file-type check.** A `Content-Type` is client-supplied and
  forged in a second. Decoding the bytes is the only way to know a file is an
  image; anything undecodable is rejected with `400 INVALID_IMAGE` before
  storage.
- **It strips everything that isn't pixels** — EXIF included, which routinely
  carries the GPS coordinates of where a photo was taken, handed over by users
  who have no idea it's in there. It also destroys any payload smuggled into
  metadata or trailing bytes, which is what makes polyglot files work. EXIF
  *orientation* is applied to the pixels first, so sideways photos stay
  upright.

- **Uploads go through the API, not straight from the browser.** Direct-to-CDN
  is cheaper in bandwidth but hands the client an upload credential and trusts
  whatever it reports back, which makes the size cap, type check and ownership
  record advisory. The API secret never leaves the server.
- **Allowed types are an explicit list**, not `image/*` — that wildcard admits
  SVG, a document format that can carry script and becomes stored XSS when
  served from your own domain. The declared Content-Type is only a first pass;
  Cloudinary decodes the file and rejects anything that isn't the image it
  claims to be.
- **Ordering is deliberate on both writes.** Upload goes to Cloudinary first,
  then the row — a row pointing at nothing is worse than no row. If the write
  fails the asset is deleted again, so a failure never strands a file accruing
  storage cost. Delete is the mirror: Cloudinary first, then the row, so a
  provider failure leaves both sides intact and retryable.
- `/media/my` pins the uploader from the token, and `uploadedBy` isn't in that
  schema at all — sending it is a 422 rather than something that looks like it
  might work.

Unconfigured Cloudinary answers **503 `MEDIA_NOT_CONFIGURED`**; a partial
config is refused at boot.

### Roles

`ROLE_CUSTOMER` < `ROLE_MODERATOR` < `ROLE_ADMIN` < `ROLE_OWNER`

Ranked, not a flat set. `authorize(ROLES.ADMIN)` takes the **minimum** rank a
route needs, so seniors inherit automatically and a new senior role never has
to be retro-fitted into every route — the one route someone forgets would be a
privilege bug, not a compile error.

Role assignment is guarded three ways: you cannot change your own role, cannot
assign a role at or above your own rank, and cannot touch a user senior to you.
So an admin can create moderators but never another admin; only an owner mints
owners. The last owner cannot be demoted or deactivated.

### Sessions

Access token (15 min, `Authorization: Bearer`) + refresh token (30 days,
rotated on every use).

The access token's payload carries `sub`, `role`, `tokenVersion`, `fullName`,
`email` and `phone` — a convenience copy so a frontend can render a
header without calling `/auth/me`. It is a **snapshot, not an authority**: a JWT
is signed but not encrypted (anyone holding it can read those values), and the
claims can go stale within the 15-minute window. Nothing server-side trusts
them — `authenticate` re-reads the user from the database on every request.

The refresh token goes out **as an httpOnly cookie and in the response body**
(`REFRESH_TOKEN_IN_BODY`, default on). `/auth/refresh` accepts either, cookie
first. Browsers should use the cookie and ignore the body field — a token
JavaScript can read is a token XSS can steal, which is exactly what httpOnly
prevents. The body copy exists for clients that cannot hold cookies: a native
app, a CLI, Postman. Set `REFRESH_TOKEN_IN_BODY=false` for a web-only deploy.

- Only the **SHA-256 hash** of a refresh token is stored — a database dump
  yields no usable sessions.
- **Rotation makes theft detectable.** Replaying an already-rotated token is
  treated as compromise: every session for that user is terminated
  (`REFRESH_TOKEN_REUSED`).
- `tokenVersion` is the revocation lever — bumping it invalidates every
  outstanding access token. Used by logout-all, password change, role change
  and deactivation.
- Login returns an identical response for an unknown email and a wrong
  password, and burns the same bcrypt time, so it can't be used to discover
  which addresses are registered.
- `role` is absent from every request schema, and schemas are `.strict()`, so
  `{"role":"admin"}` on register is a 422 rather than a privilege escalation.

## Documentation

The spec is generated by `swagger-jsdoc` from `@openapi` blocks in
`src/modules/**/*.docs.js`, beside the routes they describe — a central YAML
file goes stale within a month; docs in the same folder get edited in the same
pull request.

Shared schemas and responses live in `src/docs/components.js` and are `$ref`'d.
Endpoints are secured by default; public ones opt out with `security: []`.
`tests/docs.test.js` asserts every `$ref` resolves.

## Environment

See [`.env.example`](.env.example). Validated by Zod at boot in
`src/config/env.js` — a missing or malformed variable exits immediately with a
readable message instead of surfacing as `undefined` mid-request. Nothing else
in the codebase reads `process.env`.

## Adding a module

1. `src/modules/<name>/` with the six files above.
2. Add one entry to the `modules` table in `src/routes/index.js`.
3. Add the tag in `src/config/swagger.js`.

Nothing else changes. For cart and orders, `withTransaction()` in
`src/config/database.js` is already there — checkout and stock decrement must
not half-apply.

## Notes

- Requires Node ≥ 20 (developed on 24).
- Express 5 changes worth knowing: `req.query` is a read-only getter (validated
  input lands on `req.validated`), async handler rejections reach the error
  middleware automatically, and `app.use('*')` is gone — the 404 handler is
  mounted pathless.
- Mongoose 9 middleware receives no `next` callback; hooks return or throw.
