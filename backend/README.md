# GadgetSimp Commerce API

Express 5 + MongoDB backend for the GadgetSimp storefront. Modular monolith,
tiered rate limiting, OpenAPI docs generated from the code.

**Implemented:** auth, users, categories, products.
**Designed for, not yet built:** cart, orders, reviews — each drops in as one
folder under `src/modules/` plus one line in `src/routes/index.js`.

## Quick start

```bash
cp .env.example .env          # then fill in the two JWT secrets
npm install
npm run seed                  # optional: admin + customer + demo catalog
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
npm test              # 144 tests, in-memory MongoDB, no external services
npm run docs:export   # write openapi.json for client generation / CI diffing
```

## Architecture

Feature-first (vertical slices), not layer-first. Everything about products
lives in `modules/product/`, so a change to the catalog touches one folder
instead of reaching into four sibling directories.

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

**One response envelope.** Success and failure share a shape, so the frontend
writes one parser rather than one per endpoint. Errors carry a stable `code` —
branch on that, never on the message.

```json
{ "success": true, "message": "Products retrieved", "data": {}, "meta": {} }
{ "success": false, "message": "…", "code": "RATE_LIMIT_EXCEEDED", "errors": [], "requestId": "…" }
```

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

**Money is integer minor units.** `169999.00 BDT` is stored and sent as
`16999900`. Floats lose precision as soon as you sum line totals or apply a
percentage discount.

**Categories use a materialised path.** Each row stores its ancestor chain
(`/electronics/laptops/gaming`), so "everything under Electronics" is one
indexed prefix match instead of a recursive walk. Renames and moves rewrite
descendants in a single bulk pass.

**Stock is adjusted by signed delta, guarded in the query.** The filter carries
`stock: { $gte: -delta }`, so the database itself refuses to go negative. A
read-then-write in application code loses that race — there's a test that fires
ten concurrent decrements at one unit and asserts exactly one wins.

**Indexes are built explicitly at boot.** Mongoose's `autoIndex` is not awaited
and is skipped entirely when `bufferCommands` is off, which silently leaves a
database with nothing but `_id_` — no unique email constraint, no text search.
`ensureIndexes()` runs after models register and before the socket opens;
`tests/indexes.test.js` asserts the real index set.

**Products are archived, never deleted.** Order history will reference them.

## Rate limiting

Tiers by what abuse actually costs, each with its own counter namespace.
Configured in [`src/middleware/rateLimiter.js`](src/middleware/rateLimiter.js).

| Tier | Budget | Applied to |
| --- | --- | --- |
| `global` | 900 / 15 min | every API route, as a backstop |
| `read` | 120 / min | catalog browsing |
| `search` | 30 / min | `?search=` only — hits a `$text` index |
| `write` | 40 / min | mutations |
| `auth` | 10 **failures** / 15 min | login, refresh |
| `register` | 5 / hour | account creation |
| `sensitive` | 5 / hour | password change |

- **Identity over IP.** Signed-in callers are keyed by user id, so shoppers
  behind one NAT or carrier CGNAT don't share a bucket. Anonymous callers fall
  back to IP, normalised through `ipKeyGenerator` so an IPv6 client can't hop
  within its own /56 to reset the counter.
- **Failures are what count on auth.** `skipSuccessfulRequests` means correct
  logins are free; wrong passwords burn the budget.
- **Search is metered separately** and only when a search term is present.
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

Unverified signups are held in their own collection, never in `users`. That
keeps every row in `users` a real, reachable person, means no half-account can
log in or hold a role, and lets abandoned signups expire on their own via a
TTL index (24 h) instead of squatting on an email address forever.

- The password is **bcrypt-hashed before** the pending row is written — it is a
  real credential the moment it is typed.
- Only the **SHA-256 of the token** is stored; the raw token exists solely in
  the email. The token is single-use — a replayed link returns
  `VERIFICATION_TOKEN_INVALID`.
- `register` answers identically whether or not the address is taken, so it
  cannot be used to test which emails have accounts. If it *was* taken, the
  real account holder gets a notice instead — addressed with their own name,
  not the one the stranger submitted.
- Without `SMTP_HOST`, emails are logged rather than sent, so the flow works on
  a fresh clone with no mail account.

### Sign-in methods

`EMAIL` (password) and `FACEBOOK`. A user's `authProviders` array lists every
method their account accepts.

`POST /auth/facebook` takes the user access token from the Facebook JS SDK and
covers both signup and signin — the user taps one button and expects to end up
signed in either way.

- The token is **verified server-side and never trusted as presented**. Graph's
  `debug_token` confirms it is valid *and issued to this app* — without that
  `app_id` check, a token from any other Facebook app could be replayed here to
  sign in as that user. This is why the app secret must never reach the browser.
- No email-verification step: Facebook has already verified the address, which
  is the point of delegating identity.
- If a password account already exists for the same address, Facebook is
  **linked** to it rather than creating a duplicate, and both methods keep
  working. That is only safe because Facebook verifies email ownership — if it
  did not, this would be an account-takeover primitive.
- Facebook sometimes shares no email (user registered by phone, or declined the
  permission) → `FACEBOOK_EMAIL_MISSING`, and the client should fall back to
  email signup.
- A Facebook-only account has **no password**: `changePassword` returns
  `PASSWORD_NOT_SET`, and password login fails with the ordinary generic
  `INVALID_CREDENTIALS` rather than admitting the account exists.

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
httpOnly cookie, rotated on every use).

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
