# GadgetSimp — Frontend Instructions

**API version 1.0.0 · 91 operations across 73 paths**

Everything the storefront and admin panel can call, with the exact body each
endpoint accepts and the patterns to implement them with.

> **The endpoint reference in this file is generated from the server's OpenAPI
> spec** (`npm run docs:frontend`). It cannot drift from the running code. If
> something here disagrees with the API, the API is right and this file is
> stale — regenerate it.

---

## Contents

1. [Start here](#start-here)
2. [The response envelope](#the-response-envelope)
3. [Errors, and how to show them](#errors-and-how-to-show-them)
4. [Authentication](#authentication)
5. [An API client to build on](#an-api-client-to-build-on)
6. [Pagination](#pagination)
7. [Storefront: browsing](#storefront-browsing)
8. [Cart](#cart)
9. [Wishlist](#wishlist)
10. [Checkout and orders](#checkout-and-orders)
11. [Guest checkout that creates an account](#guest-checkout-that-creates-an-account)
12. [Admin: orders](#admin-orders)
13. [Admin: catalog](#admin-catalog)
14. [Media uploads](#media-uploads)
15. [Rate limits](#rate-limits)
16. [Rules that will bite you](#rules-that-will-bite-you)
17. [Endpoint index](#endpoint-index)

---

## Start here

- **Base URL:** every path in this document is relative to `/api/v1`.
  Locally that is `http://localhost:4000/api/v1`.
- **Content type:** `application/json` everywhere except the media upload,
  which is `multipart/form-data`.
- **Interactive docs:** `/api/v1/docs` (Swagger UI) and `/api/v1/docs.json`
  (raw spec, if you want to generate a typed client).

Set `APP_URL` on the server to your frontend origin — the verification and
password-reset emails link back to it, at `/verify-email?token=…` and
`/reset-password?token=…`. Those two routes need to exist on your side.

---

## The response envelope

Every response — success or failure — has the same shape, so you write one
parser for the whole API.

```ts
type ApiResponse<T> = {
  success: boolean;
  statusCode: number;   // repeated from the HTTP status, on purpose
  message: string;      // human-readable, safe to show
  data: T | null;
  meta?: PaginationMeta;
  code?: string;        // machine-readable, only where a call has more than one outcome
  errors?: ApiFieldError[];
  requestId?: string;   // quote this when reporting a bug
};
```

`statusCode` is in the body deliberately: it survives a logged payload, a
webhook relay, or an HTTP wrapper that only hands back parsed JSON.

**Read `data`, not the root.** A list endpoint returns
`data.products` / `data.orders` / `data.items` and puts the page counters in
`meta`.

---

## Errors, and how to show them

```ts
type ApiFieldError = {
  field: string;    // "items.1.variantId", "body.email", "note"
  code?: string;    // "INSUFFICIENT_STOCK", "VARIANT_REQUIRED"
  message: string;  // safe to show as-is
};
```

`field` points at the exact input **including array positions**, so it maps
straight onto a form control:

```json
{
  "success": false,
  "statusCode": 422,
  "message": "Your order could not be placed",
  "code": "ORDER_ITEMS_INVALID",
  "errors": [
    { "field": "items.1.quantity", "code": "INSUFFICIENT_STOCK", "message": "Only 3 of Nike Sports T-Shirt remain." }
  ]
}
```

Show `message` at the top and attach each `errors[].message` to its field.
Branch logic on `code`, never on `message` — the wording will change.

**Every request schema is strict.** An unrecognised key is a **422**, not a
silently ignored field. That is deliberate: it means a typo fails loudly
instead of doing nothing. If you get `Unrecognized keys: "x"`, remove the key.

---

## Authentication

| Token | Lifetime | Where it lives |
| --- | --- | --- |
| Access | 15 minutes | `Authorization: Bearer <token>` header |
| Refresh | 7 days, rotated on every use | httpOnly cookie `gs_refresh_token` |

The refresh token is httpOnly so JavaScript cannot read it — which is what
stops XSS from stealing a session. **You must send credentials** on refresh:

```ts
fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "include" });
```

CORS is an allow-list, so add your frontend origin to `CORS_ORIGINS` on the
server or the cookie will not be sent.

**Rotation is theft detection.** Each refresh invalidates the token used. If a
token that was already rotated is presented again, the server assumes it was
stolen and drops *every* session for that user (`REFRESH_TOKEN_REUSED`). So:
never fire two refreshes concurrently — de-duplicate them (see the client
below) or a race will sign your user out.

The access token payload carries `sub`, `email`, `fullName`,
`phone` and `role`, so you can render a header without an extra call. Do not
trust it for authorisation decisions that matter — the server re-checks the
user on every request.

### Roles

`ROLE_CUSTOMER` → `ROLE_MODERATOR` → `ROLE_ADMIN` → `ROLE_OWNER`, ranked.
Permissions accumulate upward: anything a moderator can do, an admin and owner
can too. The **Access** line on each endpoint states the minimum.

---

## An API client to build on

This handles the three things every call needs: the envelope, the bearer
token, and a single-flight refresh on 401.

```ts
const BASE = process.env.NEXT_PUBLIC_API_URL!; // http://localhost:4000/api/v1

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) { accessToken = token; }

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public errors: ApiFieldError[] = [],
  ) { super(message); }

  /** Field name -> message, ready to drop into a form library. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.errors.map((e) => [e.field, e.message]));
  }
}

/** Only ever one refresh in flight - concurrent ones trip reuse detection. */
async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) return false;
      const body = await response.json();
      accessToken = body.data.accessToken;
      return true;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; retry?: boolean } = {},
): Promise<{ data: T; meta?: PaginationMeta; code?: string; message: string }> {
  const { method = "GET", body, retry = true } = options;

  const response = await fetch(BASE + path, {
    method,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    // NOTE: DELETE with a body is intentional on /cart/items and
    // /wishlist/items - see "Rules that will bite you".
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (response.status === 401 && retry && accessToken) {
    if (await refresh()) return api<T>(path, { ...options, retry: false });
  }

  if (!response.ok || !payload?.success) {
    throw new ApiError(
      payload?.statusCode ?? response.status,
      payload?.message ?? "Request failed",
      payload?.code,
      payload?.errors ?? [],
    );
  }

  return { data: payload.data, meta: payload.meta, code: payload.code, message: payload.message };
}
```

---

## Pagination

**Pages are zero-based. The first page is `page: 0`.** This matches MUI
DataGrid and TanStack Table, so pass the table's page straight through.

```json
{ "pagination": { "page": 0, "limit": 20 } }
```

Every listing returns:

```ts
type PaginationMeta = {
  page: number;        // zero-based
  limit: number;
  total: number;       // matching rows, not rows on this page
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};
```

**Filter endpoints are `POST` with the filter in the body**, not GET with a
query string. The filter sets are open-ended — arrays of attribute values,
ranges, nested sort objects — and encoding that in a query string means bracket
syntax every client has to agree on, plus URL length limits.

---

## Storefront: browsing

Public, no token needed. Send one anyway when you have it and the shopper gets
rate-limited by account rather than sharing an IP bucket with everyone behind
the same NAT.

| Need | Call |
| --- | --- |
| Home page category tiles | `POST /shop/categories` with `{ showInHome: true }` |
| Product grid / search / filters | `POST /shop` |
| Filter sidebar for a category | `GET /shop/filter-options/{categorySlug}` |
| Product page | `GET /shop/{slug}` |

Everything is addressed by **slug**, not id — the shopper's URL is
`/shop/laptops`, so the API speaks the same language and no lookup is needed
to render a page.

```json
{
  "categorySlugs": ["t-shirts"],
  "brandSlugs": ["nike"],
  "search": "sports",
  "price": { "min": 500, "max": 2000 },
  "inStock": true,
  "featured": false,
  "filters": { "color": ["black", "white"], "size": ["m"] },
  "sort": { "field": "price", "direction": "asc" },
  "pagination": { "page": 0, "limit": 24 }
}
```

- `categorySlugs` is a **list**, and each slug expands to its whole subtree —
  `electronics` also returns products filed under its children.
- `filters` is category-driven. The keys come from
  `GET /shop/filter-options/{categorySlug}`; **do not hardcode them**. Sending
  `filters` without `categorySlugs` is a 422, because attribute keys are
  resolved from the category configuration.
- `POST /shop` returns the **lightweight card shape** — no descriptions, no
  attribute maps, no galleries. Fetch `GET /shop/{slug}` for the full record.

### Product attributes are grouped

A product's spec table is an **ordered array of titled groups**, and the order
is the display order:

```json
"attributes": [
  { "title": "General Info", "options": { "material": "cotton", "fit": "regular" } },
  { "title": "Care",         "options": { "wash": "cold" } }
]
```

Render each group as a block with its `title` as the heading. Filtering is
unaffected by grouping — you filter on the bare key (`material`), and the
server searches every group.

---

## Cart

Signed-in only. Every endpoint returns **the whole cart**, never a delta, so
assign the response to state rather than merging:

```ts
const { data } = await api<{ cart: Cart; adjustments: Adjustment[] }>("/cart");
setCart(data.cart);
```

| Action | Call |
| --- | --- |
| Load | `GET /cart` |
| Header badge | `GET /cart/count` |
| Add (batch) | `POST /cart/items` |
| Change quantities (batch) | `PATCH /cart/items` |
| Remove (batch) | `DELETE /cart/items` |
| Empty | `DELETE /cart` |

**Variants.** A cart line is a product *plus a variant*. A `VARIABLE` product
**requires** `variantId`; a `SIMPLE` one **refuses** it. Two variants of one
product are two separate lines.

**Address lines by `id`.** `PATCH` and `DELETE` take the cart line's `id`
(from `cart.items[].id`), not the product id — one product can occupy several
lines through different variants.

**`quantity: 0` removes a line.** The stepper on a cart row decrements to zero;
you do not need to switch endpoints.

**Handle `adjustments`.** Quantity is the one thing the server changes rather
than rejecting — it caps to available stock. Show it, or the shopper silently
gets fewer than they asked for:

```ts
if (data.adjustments.length) {
  toast(data.adjustments.map((a) => a.message).join(" "));
}
```

**Handle `issues` per line.** A cart whose product was withdrawn overnight
still loads — the row comes back with `availability.purchasable: false` and an
`issues` array explaining why (`PRODUCT_UNAVAILABLE`, `OUT_OF_STOCK`,
`INSUFFICIENT_STOCK`, `PRICE_CHANGED`). Render those rows greyed with a remove
button; never hide them, or the shopper can never clear them.

**Gate checkout on `summary.checkoutReady`.** It already folds in every issue.
Note that `summary.subtotal` counts **purchasable lines only**, while
`summary.totalQuantity` counts every line (it is the header badge).

**`availability.maxQuantity: null` means no ceiling**, not zero — use it to
bound a quantity stepper.

---

## Wishlist

Signed-in only. Products only — **no variants**. A wishlist records "I want
this thing"; the size is chosen at the point of buying.

| Action | Call |
| --- | --- |
| Fill in heart icons on a grid | `GET /wishlist/ids` |
| The wishlist page | `POST /wishlist/filter` |
| Save (batch) | `POST /wishlist/items` |
| Remove (batch) | `DELETE /wishlist/items` |
| Heart icon | `POST /wishlist/toggle` |
| Clear | `DELETE /wishlist` |

**Use `GET /wishlist/ids` for hearts.** Call it once on load, keep the ids in a
`Set`, and render every heart from that. Asking the paginated listing would
ship a hundred product cards to render a hundred booleans.

**Use `POST /wishlist/toggle` for the button**, not add/remove. The caller does
not say which direction — the server decides from current state, which makes a
double tap self-correcting even when your cached id list is stale. It answers
`{ productId, inWishlist, total }`, so set the icon from the response.

Saving is **idempotent** — re-saving something already there is fine and comes
back under `alreadySaved`. Removing an id that is not there is fine too.

**Out-of-stock products can be saved** (unlike the cart, which refuses them) —
that is half the point of a wishlist. Only *withdrawn* products are refused,
and existing entries for them stay listed with `available: false` so they can
still be removed.

---

## Checkout and orders

`POST /orders` works **signed in or as a guest**. Send a token if you have
one and the order links to that account.

### Prices are server-side. All of them.

No endpoint accepts a price, subtotal, total, discount or shipping fee. You
send products and quantities; the server resolves every figure from the catalog
and freezes it onto the order. Sending `total` is a **422**, not an ignored
field.

Render money from what the API returns. Never compute a total client-side and
send it.

```json
{
  "items": [
    { "productId": "6712f0c2a1b4d3e5f6a7b8c9", "variantId": "6712f0c2a1b4d3e5f6a7b8d1", "quantity": 2 },
    { "productId": "6712f0c2a1b4d3e5f6a7b8ca", "quantity": 1 }
  ],
  "contact": { "name": "Rahim Uddin", "phone": "+8801712345678" },
  "shippingAddress": {
    "line1": "House 42, Road 3, Dhanmondi",
    "area": "Dhanmondi",
    "city": "Dhaka",
    "postalCode": "1209",
    "country": "Bangladesh"
  },
  "note": "Please call before delivery",
  "paymentMethod": "CASH_ON_DELIVERY",
  "idempotencyKey": "8f14e45f-ceea-467a-9c1e-1b2c3d4e5f60"
}
```

- `contact.name`, `contact.phone`, `shippingAddress.line1` and
  `shippingAddress.city` are **required**. A cash-on-delivery order that
  cannot be phoned cannot be delivered.
- `note` is optional.
- `paymentMethod` has one value today, `CASH_ON_DELIVERY`.
- The order is **all or nothing**: if any line is unavailable or short on
  stock, nothing is placed and the 422 names each offending position.

### Always send an `idempotencyKey`

Generate a UUID when the checkout form mounts and send the same one on every
retry. A double-tapped "Place order" on a flaky mobile connection is the normal
way duplicate cash-on-delivery orders get created, and the customer finds out
when two couriers arrive.

On a retry the original order comes back with **200** and
`code: "ORDER_ALREADY_PLACED"` instead of a second order being created.

> **Retry the identical body.** The key is scoped server-side to the caller
> (account → else `email` → else IP). A retry that drops `email`, or arrives on
> a session the first attempt did not have, lands in a different scope and
> places a second order.

### After placing

```ts
const { data, code } = await api<{ order: Order; accountInvite: AccountInvite | null }>(
  "/orders",
  { method: "POST", body: checkout },
);

if (code === "ORDER_ALREADY_PLACED") { /* already had one - go to the same confirmation */ }
router.push(`/orders/${data.order.orderNumber}`);
```

Show the customer `order.orderNumber` — the six-digit number they quote on the
phone. `order.id` is the internal integer used by the API paths.

### A customer's own orders

`POST /orders/filter` and `GET /orders/{id}`. There is **no `userId` field** —
the owner comes from the token. Someone else's order answers **404, not 403**,
because order ids are sequential and "exists but is not yours" is itself
information.

---

## Guest checkout that creates an account

Send `createAccount: true` and an `email` on `POST /orders`. The order is
placed either way; the account is a follow-up. Three calls:

**1. Place the order.** The response carries `accountInvite`:

| `accountInvite.status` | What to show |
| --- | --- |
| `VERIFICATION_SENT` | "Check your inbox to finish setting up your account." |
| `ACCOUNT_EXISTS` | "You already have an account — sign in." |
| `INVITATION_FAILED` | Nothing about the order; it succeeded. Optionally offer to retry signup. |

**2. They click the emailed link** → your `/verify-email?token=…` page posts
the token to `POST /auth/verify-email`.

This answers **200** with **`code: "REQUIRED_PASSWORD"`** and a
`registrationToken` — and **no session**. A link that arrived by email proves
only mailbox access, so it is not treated as a login.

```ts
const { data, code } = await api("/auth/verify-email", { method: "POST", body: { token } });

if (code === "REQUIRED_PASSWORD") {
  openPasswordModal(data.registrationToken);   // data also has email, fullName
} else {
  setAccessToken(data.accessToken);            // normal signup: already an account
}
```

**Branch on `code`, not the status** — that is the field that separates the two
outcomes.

**3. The password modal** posts to `POST /auth/complete-registration` with
`{ token: registrationToken, password }`. The account is created, they are
signed in, and **their guest orders attach to the new account**. No second
verification email.

The `registrationToken` is valid for 30 minutes. The token from the email
itself will *not* work at step 3 — the address has to be verified first, and
step 2 rotates it.

---

## Admin: orders

Two separate surfaces, deliberately: `/orders` is the customer's own, and
`/admin/orders` reaches every order in the system.

| Action | Call | Minimum role |
| --- | --- | --- |
| The queue | `POST /admin/orders/filter` | Moderator |
| One order | `GET /admin/orders/{id}` | Moderator |
| Move status | `PATCH /admin/orders/{id}/status` | Moderator |
| Fix name / phone / address / note | `PATCH /admin/orders/{id}` | Moderator |
| Soft delete | `DELETE /admin/orders/{id}` | Admin |
| Permanent delete | `DELETE /admin/orders/{id}/permanent` | Admin |

The admin shape carries everything the customer shape does **plus** `userId`,
`client` (the IP, OS, browser and device the order was placed from),
`stockReleased`, `updatedBy` and `deletedAt`.

`search` is one box matching order number, customer name, phone or email —
build the UI as a single field, because that is what the person on the phone
has.

### The status workflow

Only these moves are legal. Anything else is a 422
(`ORDER_STATUS_TRANSITION_INVALID`), so **drive the buttons from this table**
rather than offering all six statuses:

| From | Allowed next |
| --- | --- |
| `PENDING` | `CONFIRMED`, `CANCELED` |
| `CONFIRMED` | `OUT_FOR_DELIVERY`, `CANCELED` |
| `OUT_FOR_DELIVERY` | `DELIVERED`, `RETURNED`, `CANCELED` |
| `DELIVERED` | `RETURNED` |
| `RETURNED`, `CANCELED` | *terminal* |

**`note` is required for `RETURNED` and `CANCELED`**, optional otherwise. Make
the note field mandatory in the UI when one of those is selected, or you will
get `ORDER_STATUS_NOTE_REQUIRED`. Whitespace does not count.

Reaching `DELIVERED` also sets `paymentStatus: "PAID"` — cash on delivery is
settled when the courier hands it over. Reaching `RETURNED` or `CANCELED`
returns the reserved stock to the catalog.

`statusHistory` is append-only and carries `{ status, note, changedBy,
changedAt }` — render it as a timeline.

### What admins cannot do

There is **no way to edit a price, a line item, a quantity or a total** through
this API. `PATCH /admin/orders/{id}` reaches contact details, address and note,
nothing else. Do not build a UI that implies otherwise.

Address fields **merge** — sending only `city` fixes the city without wiping
the street. Sending `note: null` clears it; omitting it leaves it alone.

Editing is refused once an order is `DELIVERED`, `RETURNED` or `CANCELED`
(`ORDER_FINALISED`) — at that point the address is the record of where the
goods actually went.

---

## Admin: catalog

| Resource | Create | List | Update |
| --- | --- | --- | --- |
| Products | `POST /products` | `POST /products/filter` | `PUT /products/{id}` or a section patch |
| Categories | `POST /categories` | `POST /categories/filter` | `PUT /categories/{id}` |
| Brands | `POST /brands` | `POST /brands/filter` | `PUT /brands/{id}` |
| Attributes | `POST /attributes` | `POST /attributes/filter` | `PUT /attributes/{id}` |
| Variations | `POST /variations/generate` | `POST /variations/filter` | `PATCH /variations/{id}` |

### Use the section patches, not `PUT`

`PUT /products/{id}` requires the **whole** document, so saving a price change
means round-tripping every field — and any field your form did not load is
silently reset. Each admin panel should save through its own endpoint:

| Panel | Endpoint |
| --- | --- |
| Name, slug, brand, categories, SKU, status, visibility, featured | `PATCH /products/{id}/general` |
| Description, short description | `PATCH /products/{id}/description` |
| Prices | `PATCH /products/{id}/pricing` |
| Stock | `PATCH /products/{id}/stock` |
| Attributes, tags | `PATCH /products/{id}/attributes` |
| Thumbnail, gallery | `PATCH /products/{id}/media` |
| SEO | `PATCH /products/{id}/seo` |
| Featured toggle | `PATCH /products/{id}/featured` |
| Status toggle | `PATCH /products/{id}/status` |

**`publishedAt` is not an input.** The server stamps it on the first
transition to `ACTIVE`. Do not send it — it is a 422.

**`productType` cannot be patched.** Flipping `VARIABLE` to `SIMPLE` would
orphan every generated SKU. It is set at creation.

**Attributes replace wholesale.** `PATCH /products/{id}/attributes` swaps the
entire group list — send every group you want to keep. A key may appear in only
one group, and group titles must be unique; both are 422s naming the offending
index.

---

## Media uploads

`POST /media/upload` — `multipart/form-data`, file on the `file` field, any
signed-in role.

```ts
const form = new FormData();
form.append("file", file);
form.append("tag", "product-gallery");   // optional grouping label

const response = await fetch(`${BASE}/media/upload`, {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}` },  // no Content-Type - let the browser set the boundary
  body: form,
});
```

- **Max 3 MB**, enforced while streaming — an oversized file is rejected
  without being buffered. Check the size client-side first for a better message.
- Allowed: JPEG, PNG, WebP, GIF, AVIF. **SVG is refused** — it is a document
  format that can carry script.
- **Everything is converted to WebP server-side**, animated GIFs included. The
  response reports the saving; do not convert client-side.
- The response gives an integer `id` and a `url`. Use the `url` for
  `thumbnail.src` / `images[].src` on a product.
- `POST /media/my` lists the caller's own uploads. `POST /media/filter` and
  `DELETE /media/{id}` are admin and above.

---

## Rate limits

Endpoints sit in tiers with separate budgets. Every response carries
`RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`; a **429** adds
`Retry-After` in seconds.

Honour `Retry-After` rather than retrying immediately. The tightest limits are
on auth and on anything that sends mail (register, resend verification, forgot
password) — debounce those forms and disable the submit button while in flight.

---

## Rules that will bite you

1. **`DELETE` with a body.** `DELETE /cart/items` and `DELETE /wishlist/items`
   take JSON so a batch removal is one request instead of N that can
   half-succeed. `fetch` handles it; **axios needs
   `axios.delete(url, { data: { … } })`** — a plain second argument is treated
   as config and silently dropped.
2. **Pages start at 0.** Not 1.
3. **Strict bodies.** An unknown key is a 422. This is how a typo fails loudly.
4. **Never send prices.** Not on orders, not anywhere.
5. **Branch on `code`, not `message`.** Especially
   `REQUIRED_PASSWORD` and `ORDER_ALREADY_PLACED`.
6. **One refresh at a time.** Concurrent refreshes trip reuse detection and
   sign the user out of everything.
7. **`VARIABLE` products need a `variantId`** in the cart and at checkout;
   `SIMPLE` products refuse one. The wishlist takes neither.
8. **Cart lines are addressed by line `id`**, not product id. The wishlist is
   addressed by **product id**.
9. **Do not hide unavailable cart or wishlist rows.** They come back flagged
   precisely so the shopper can remove them.
10. **`maxQuantity: null` means unlimited**, not zero.
11. **Order status moves are constrained.** Read the transition table before
    building the buttons.
12. **`note` is mandatory for `RETURNED` and `CANCELED`.**

---


## Endpoint index

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| `GET` | [`/health`](#get-health) | Public | Liveness and dependency check |
| `POST` | [`/auth/register`](#post-auth-register) | Public | Step 1 of signup - request an email confirmation |
| `POST` | [`/auth/verify-email`](#post-auth-verify-email) | Public | Step 2 of signup - confirm the email |
| `POST` | [`/auth/complete-registration`](#post-auth-complete-registration) | Public | Step 3 - set a password for a guest-checkout signup |
| `POST` | [`/auth/resend-verification`](#post-auth-resend-verification) | Public | Send a fresh confirmation link |
| `POST` | [`/auth/social-login`](#post-auth-social-login) | Public | Sign in or sign up with Facebook or Google |
| `GET` | [`/auth/providers`](#get-auth-providers) | Public | List the sign-in methods this server supports |
| `POST` | [`/auth/login`](#post-auth-login) | Public | Sign in with email and password |
| `POST` | [`/auth/refresh`](#post-auth-refresh) | Public | Rotate the session and get a fresh access token |
| `POST` | [`/auth/logout`](#post-auth-logout) | Any signed-in user | Sign out of the current device |
| `POST` | [`/auth/logout-all`](#post-auth-logout-all) | Any signed-in user | Sign out of every device |
| `POST` | [`/auth/forgot-password`](#post-auth-forgot-password) | Public | Request a password reset link |
| `POST` | [`/auth/reset-password`](#post-auth-reset-password) | Public | Set a new password using an emailed token |
| `POST` | [`/auth/change-password`](#post-auth-change-password) | Any signed-in user | Change the current password |
| `GET` | [`/auth/me`](#get-auth-me) | Any signed-in user | Get the signed-in user |
| `GET` | [`/users/me`](#get-users-me) | Any signed-in user | Get your profile |
| `PATCH` | [`/users/me`](#patch-users-me) | Any signed-in user | Update your profile |
| `POST` | [`/users/filter`](#post-users-filter) | Any signed-in user | Filter and page through users |
| `POST` | [`/users/create`](#post-users-create) | Any signed-in user | Create a user account (owner only) |
| `GET` | [`/users/{id}`](#get-users-id) | Moderator and above | Get a user by id (self, or ROLE_MODERATOR and above) |
| `DELETE` | [`/users/{id}`](#delete-users-id) | Admin and above | Soft delete a user (ROLE_ADMIN and above) |
| `DELETE` | [`/users/{id}/permanent`](#delete-users-id-permanent) | Any signed-in user | Permanently delete a user (owner only) |
| `PATCH` | [`/users/{id}/role`](#patch-users-id-role) | Any signed-in user | Change a user's role |
| `PATCH` | [`/users/{id}/status`](#patch-users-id-status) | Any signed-in user | Suspend or reactivate an account |
| `POST` | [`/media/upload`](#post-media-upload) | Any signed-in user | Upload a file |
| `POST` | [`/media/my`](#post-media-my) | Any signed-in user | List your own uploads |
| `POST` | [`/media/filter`](#post-media-filter) | Any signed-in user | List every user's uploads |
| `DELETE` | [`/media/{id}`](#delete-media-id) | Any signed-in user | Delete a file |
| `POST` | [`/products`](#post-products) | Any signed-in user | Create a product |
| `PATCH` | [`/products/{id}/general`](#patch-products-id-general) | Any signed-in user | Update general details |
| `PATCH` | [`/products/{id}/description`](#patch-products-id-description) | Any signed-in user | Update descriptions |
| `PATCH` | [`/products/{id}/pricing`](#patch-products-id-pricing) | Any signed-in user | Update pricing |
| `PATCH` | [`/products/{id}/stock`](#patch-products-id-stock) | Any signed-in user | Update stock |
| `PATCH` | [`/products/{id}/attributes`](#patch-products-id-attributes) | Any signed-in user | Update attributes and tags |
| `PATCH` | [`/products/{id}/media`](#patch-products-id-media) | Any signed-in user | Update thumbnail and gallery |
| `PATCH` | [`/products/{id}/featured`](#patch-products-id-featured) | Any signed-in user | Feature or unfeature a product |
| `PATCH` | [`/products/{id}/status`](#patch-products-id-status) | Any signed-in user | Publish, unpublish or hide a product |
| `PATCH` | [`/products/{id}/seo`](#patch-products-id-seo) | Any signed-in user | Update SEO |
| `POST` | [`/products/filter`](#post-products-filter) | Any signed-in user | Filter products for staff |
| `GET` | [`/products/{id}`](#get-products-id) | Any signed-in user | Get a product with minimal relationships and variations |
| `PUT` | [`/products/{id}`](#put-products-id) | Any signed-in user | Replace a product |
| `DELETE` | [`/products/{id}`](#delete-products-id) | Any signed-in user | Archive a product and its variations |
| `POST` | [`/shop`](#post-shop) | Public | Browse the storefront |
| `POST` | [`/shop/categories`](#post-shop-categories) | Public | Storefront categories for a home page or nav menu |
| `GET` | [`/shop/filter-options/{categorySlug}`](#get-shop-filter-options-categoryslug) | Public | Filter options and facet counts for a category |
| `GET` | [`/shop/{slug}`](#get-shop-slug) | Public | Full product detail by slug |
| `GET` | [`/cart`](#get-cart) | Any signed-in user | The signed-in shopper's cart |
| `DELETE` | [`/cart`](#delete-cart) | Any signed-in user | Empty the cart |
| `GET` | [`/cart/count`](#get-cart-count) | Any signed-in user | Line and unit counts for the header badge |
| `POST` | [`/cart/items`](#post-cart-items) | Any signed-in user | Add items in bulk |
| `PATCH` | [`/cart/items`](#patch-cart-items) | Any signed-in user | Update quantities in bulk |
| `DELETE` | [`/cart/items`](#delete-cart-items) | Any signed-in user | Remove several lines at once |
| `POST` | [`/wishlist/filter`](#post-wishlist-filter) | Any signed-in user | The caller's saved products, with live product data |
| `GET` | [`/wishlist/ids`](#get-wishlist-ids) | Any signed-in user | Every saved product id, and nothing else |
| `POST` | [`/wishlist/items`](#post-wishlist-items) | Any signed-in user | Save products |
| `DELETE` | [`/wishlist/items`](#delete-wishlist-items) | Any signed-in user | Remove saved products |
| `POST` | [`/wishlist/toggle`](#post-wishlist-toggle) | Any signed-in user | Toggle one product - the heart icon |
| `DELETE` | [`/wishlist`](#delete-wishlist) | Any signed-in user | Remove everything |
| `POST` | [`/orders`](#post-orders) | Public | Place an order |
| `POST` | [`/orders/filter`](#post-orders-filter) | Any signed-in user | The signed-in customer's own orders |
| `GET` | [`/orders/{id}`](#get-orders-id) | Any signed-in user | One of the customer's own orders |
| `POST` | [`/admin/orders/filter`](#post-admin-orders-filter) | Moderator and above | The staff order queue |
| `GET` | [`/admin/orders/{id}`](#get-admin-orders-id) | Moderator and above | One order, full staff shape |
| `PATCH` | [`/admin/orders/{id}`](#patch-admin-orders-id) | Moderator and above | Correct the delivery details |
| `DELETE` | [`/admin/orders/{id}`](#delete-admin-orders-id) | Admin and above | Soft delete an order |
| `PATCH` | [`/admin/orders/{id}/status`](#patch-admin-orders-id-status) | Moderator and above | Move an order through the workflow |
| `DELETE` | [`/admin/orders/{id}/permanent`](#delete-admin-orders-id-permanent) | Admin and above | Permanently delete an order |
| `POST` | [`/categories`](#post-categories) | Any signed-in user | Create a hierarchical category |
| `PATCH` | [`/categories/show-in-home`](#patch-categories-show-in-home) | Any signed-in user | Set the home-page flag on several categories |
| `POST` | [`/categories/filter`](#post-categories-filter) | Public | Filter public categories |
| `POST` | [`/categories/filter-groupped`](#post-categories-filter-groupped) | Public | Filter categories as a grouped hierarchy |
| `PUT` | [`/categories/sort`](#put-categories-sort) | Any signed-in user | Reorder or move categories |
| `GET` | [`/categories/{id}/configuration`](#get-categories-id-configuration) | Public | Get resolved category attribute configuration |
| `GET` | [`/categories/{id}`](#get-categories-id) | Public | Get a public category |
| `PUT` | [`/categories/{id}`](#put-categories-id) | Any signed-in user | Replace a category |
| `DELETE` | [`/categories/{id}`](#delete-categories-id) | Any signed-in user | Archive a category |
| `POST` | [`/brands`](#post-brands) | Any signed-in user | Create a global brand |
| `POST` | [`/brands/filter`](#post-brands-filter) | Public | Filter public brands |
| `GET` | [`/brands/{id}`](#get-brands-id) | Public | Get a public brand |
| `PUT` | [`/brands/{id}`](#put-brands-id) | Any signed-in user | Replace a brand |
| `DELETE` | [`/brands/{id}`](#delete-brands-id) | Any signed-in user | Archive a brand |
| `POST` | [`/attributes`](#post-attributes) | Any signed-in user | Create an Attribute Library entry |
| `POST` | [`/attributes/filter`](#post-attributes-filter) | Any signed-in user | Filter and paginate the Attribute Library |
| `GET` | [`/attributes/{id}`](#get-attributes-id) | Any signed-in user | Get an Attribute Library entry |
| `PUT` | [`/attributes/{id}`](#put-attributes-id) | Any signed-in user | Replace an Attribute Library entry |
| `DELETE` | [`/attributes/{id}`](#delete-attributes-id) | Any signed-in user | Archive an attribute |
| `POST` | [`/variations/generate`](#post-variations-generate) | Any signed-in user | Preview variation combinations without saving them |
| `POST` | [`/variations/filter`](#post-variations-filter) | Any signed-in user | Filter and paginate variations |
| `GET` | [`/variations/{id}`](#get-variations-id) | Any signed-in user | Get a variation |
| `PATCH` | [`/variations/{id}`](#patch-variations-id) | Any signed-in user | Partially update price, stock, image or other variation data |
| `DELETE` | [`/variations/{id}`](#delete-variations-id) | Any signed-in user | Delete a variation |

---

# Endpoint reference

## Health

Liveness and readiness probes

### `GET /health`

**Access:** Public

Liveness and dependency check

Returns 200 only when the database is actually reachable, so an orchestrator restarts a pod that has lost Mongo instead of leaving it in the load balancer answering every request with a 500.

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Service healthy. |
| `503` | A dependency is unavailable. |

---

## Auth

Registration, login, token rotation, logout

### `POST /auth/register`

**Access:** Public

Step 1 of signup - request an email confirmation

**No account is created by this call.** The details are held in a pending record and a confirmation link is emailed. The account exists only after `POST /auth/verify-email` succeeds, which means the users collection never contains unverified or unreachable accounts.

Returns `202 Accepted` with no user and no tokens. The response is deliberately identical whether or not the address is already registered - anything else would let a caller test which emails have accounts. If it was already taken, the real account holder is emailed a notice instead.

The emailed link is valid for **10 minutes**. It is a bearer credential that creates an account, so the window is deliberately narrow; if it lapses, `POST /auth/resend-verification` issues a fresh one. Expired signups are removed automatically, releasing the address. Limited to 5 registrations per hour per IP.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `fullName` | string | **yes** | maxLength 120. |
| `email` | string | **yes** |  |
| `password` | string | **yes** | At least 8 characters with an uppercase letter, a lowercase letter and a digit. minLength 8. |
| `phone` | string | no |  |

**Responses**

| Status | Meaning |
| --- | --- |
| `202` | Confirmation email sent (or silently skipped if the address was taken). |
| `422` | Request failed schema validation. |
| `429` | Rate limit for this tier exhausted. |

---

### `POST /auth/verify-email`

**Access:** Public

Step 2 of signup - confirm the email

Consumes the token from the emailed link. **What happens next depends on how the signup started, and a client must handle both.**

**Normal signup** (the password was chosen up front): the account is created and the user is signed straight in - they clicked the link seconds ago, so asking for the password again would add nothing. Answers **201** with the usual auth payload.

**Guest-checkout signup** (`createAccount: true` on `POST /orders`, where there never was a password field): the address is confirmed and nothing else. Answers **200** with **`code: "REQUIRED_PASSWORD"`** and a `registrationToken`, and deliberately **no session** - a link that arrived by email proves only mailbox access, and treating it as a login would make a forwarded message an account takeover. Collect a password and post it with that token to `POST /auth/complete-registration`.

Branch on the top-level `code`, not on the status: it is the field that says which of the two happened.

The token is single use in both cases. Replaying a link that has already been used returns `400 VERIFICATION_TOKEN_INVALID`, because the pending record is either deleted or its token rotated. Only a SHA-256 hash of the token is stored, so a database dump cannot be used to confirm someone else's address.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `token` | string | **yes** | The `token` query parameter from the emailed link. |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Guest-checkout signup: the email is confirmed but a password is still needed. Carries `code: "REQUIRED_PASSWORD"` and **no session**. Open a password modal and post to `/auth/complete-registration` with the `registrationToken`. |
| `201` | Account created and signed in. Refresh token set as an httpOnly cookie. |
| `400` | Token invalid, already used, or expired. |
| `409` | Conflicts with existing state, e.g. a duplicate unique field. |
| `429` | Rate limit for this tier exhausted. |

---

### `POST /auth/complete-registration`

**Access:** Public

Step 3 - set a password for a guest-checkout signup

Finishes the account that `POST /orders` offered to create. Takes the `registrationToken` returned by `/auth/verify-email` alongside `code: "REQUIRED_PASSWORD"`, plus the password the customer just chose.

**No second verification email.** The address was confirmed minutes ago by the call that issued this token; asking again would be theatre. The session is issued here, because this is the point the user proved knowledge of a secret they chose - not merely access to a mailbox.

Creating the account also **attaches the guest orders placed with that address** to it, which is what makes the purchase that prompted the signup appear in their order history rather than an empty list.

The token from the verification email itself will not work here: the address has to be proven first, and `verify-email` rotates the token when it does. That ordering is what stops the emailed link being spent directly on account creation, skipping the verification it exists to perform.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `token` | string | **yes** | The `registrationToken` from `/auth/verify-email`. Valid for 30 minutes. |
| `password` | string | **yes** | At least 8 characters with an uppercase letter, a lowercase letter and a digit. minLength 8. |

```json
{
  "token": "4bR7tY2wQ9zX1cV3bN5mK8jH0gF6dS4aP2oI7uY5tR3",
  "password": "Str0ngPass"
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `201` | Account created and signed in. Refresh token set as an httpOnly cookie. |
| `400` | Token invalid or expired (`REGISTRATION_TOKEN_INVALID`, `REGISTRATION_TOKEN_EXPIRED`), the address was never confirmed (`EMAIL_NOT_VERIFIED`), or this signup already has a password (`PASSWORD_ALREADY_SET`). |
| `409` | Conflicts with existing state, e.g. a duplicate unique field. |
| `422` | Request failed schema validation. |
| `429` | Rate limit for this tier exhausted. |

---

### `POST /auth/resend-verification`

**Access:** Public

Send a fresh confirmation link

Issues a new token and invalidates the previous one, so a forwarded or intercepted older email stops working. This is the recovery path when a 10-minute link lapses before the user reaches their inbox.

Always answers 200, whether or not a pending signup exists. Capped at 5 resends per signup with a 60 second cooldown between them, and limited to 5 requests per hour per caller - this endpoint sends mail to an address the caller names, so it is the obvious one to abuse for spamming a third party's inbox.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string | **yes** |  |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Accepted. Says nothing about whether the address exists. |
| `429` | Cooldown active, per-signup resend cap reached, or tier limit hit. |

---

### `POST /auth/social-login`

**Access:** Public

Sign in or sign up with Facebook or Google

One endpoint for every social provider, discriminated by `type`. It covers both signing up and signing in - the user taps a button and expects to end up signed in either way, so the response does not say which happened.

**What to send as `token` depends on the provider**, because the two vendors hand the browser different things:

- `FACEBOOK` - the opaque **user access token** from `FB.login()`.
- `GOOGLE` - the **ID token** (the `credential` field) from Google Identity Services. This is a JWT and runs well over 1KB.

**The token is verified server-side and never trusted as presented.** Facebook tokens are checked against Graph `debug_token`; Google ID tokens have their signature verified against Google's public keys. Both verify that the token was issued to *this* application - without that audience check, a token from any other app could be replayed here to sign in as that user.

There is no email-verification step on this route: the provider has already verified the address, which is the point of delegating identity. A Google account whose email is not verified is rejected.

If an account already exists for the same address, the provider is **linked** to it rather than creating a duplicate, and the user can then sign in by any linked method. If the provider shares no email (a Facebook user who registered by phone, or declined the permission), the request fails with `SOCIAL_EMAIL_MISSING` and the client should fall back to email signup.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `FACEBOOK` \| `GOOGLE` | **yes** |  |
| `token` | string | **yes** | Access token (Facebook) or ID token (Google). |

```json
{
  "type": "GOOGLE",
  "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6..."
}
```

*Facebook JS SDK*

```json
{
  "type": "FACEBOOK",
  "token": "EAAGm0PX4ZCpsBA..."
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Signed in. An account is created on first use. |
| `400` | The provider shared no email address. |
| `401` | Token invalid, expired, issued to a different application (`SOCIAL_TOKEN_WRONG_AUDIENCE`), or - for Google - attached to an unverified email (`SOCIAL_EMAIL_UNVERIFIED`). |
| `403` | Authenticated, but not allowed to perform this action. |
| `422` | Request failed schema validation. |
| `429` | Rate limit for this tier exhausted. |
| `503` | That provider is not configured on this server. |

---

### `GET /auth/providers`

**Access:** Public

List the sign-in methods this server supports

Reflects what is actually configured, so a frontend renders only the buttons that will work rather than a Google button that returns 503.

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Available providers. |

---

### `POST /auth/login`

**Access:** Public

Sign in with email and password

Returns an access token in the body and sets the refresh token cookie. Rate limited to 10 **failed** attempts per 15 minutes, keyed on IP and submitted email; successful sign-ins do not consume the budget.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string | **yes** |  |
| `password` | string | **yes** |  |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Signed in. |
| `401` | Invalid credentials. Deliberately identical whether the email is unknown or the password is wrong, so the endpoint cannot be used to discover which addresses are registered. |
| `403` | Authenticated, but not allowed to perform this action. |
| `429` | Rate limit for this tier exhausted. |

---

### `POST /auth/refresh`

**Access:** Public

Rotate the session and get a fresh access token

Reads the `gs_refresh_token` cookie - or, for a client that cannot hold cookies, a `refreshToken` in the body - invalidates it and issues a new pair. The cookie wins if both are sent. Presenting a refresh token that was already rotated is treated as theft: every session for that user is terminated and the response is 401 `REFRESH_TOKEN_REUSED`.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `refreshToken` | string | no | Only needed by clients that cannot send the cookie. |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | New access token issued and refresh cookie rotated. |
| `401` | Missing, invalid, expired or revoked access token. |
| `429` | Rate limit for this tier exhausted. |

---

### `POST /auth/logout`

**Access:** Any signed-in user

Sign out of the current device

Removes this session only. Other devices stay signed in.

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Signed out and refresh cookie cleared. |
| `401` | Missing, invalid, expired or revoked access token. |

---

### `POST /auth/logout-all`

**Access:** Any signed-in user

Sign out of every device

Bumps the user's token version, which immediately invalidates all outstanding access tokens as well as stored refresh sessions.

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | All sessions terminated. |
| `401` | Missing, invalid, expired or revoked access token. |

---

### `POST /auth/forgot-password`

**Access:** Public

Request a password reset link

Emails a single-use reset link, valid for **10 minutes**. Issuing a new link invalidates any previous one.

Always answers 200, whether or not the address has an account - a different response would make this a free membership oracle, which would undo the care taken over login and signup.

A social-only account may reset too: they own the address, and it gives them a password to use alongside Google or Facebook. Limited to 5 requests per hour, since it sends mail to an address the caller names.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string | **yes** |  |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Accepted. Says nothing about whether the address exists. |
| `429` | Rate limit for this tier exhausted. |

---

### `POST /auth/reset-password`

**Access:** Public

Set a new password using an emailed token

Consumes the token from the reset email. The token is single use, and only its SHA-256 hash is stored, so a database dump cannot be used to seize accounts.

On success **every session is revoked** - a reset is the standard response to a suspected compromise, so leaving other devices signed in would defeat the purpose. A notification email is sent, which is what lets a victim notice a takeover.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `token` | string | **yes** | The `token` query parameter from the emailed link. |
| `newPassword` | string | **yes** | At least 8 characters with an uppercase letter, a lowercase letter and a digit. minLength 8. |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Password reset; all sessions signed out. |
| `400` | Token invalid, already used, or expired. |
| `403` | Authenticated, but not allowed to perform this action. |
| `422` | Request failed schema validation. |
| `429` | Rate limit for this tier exhausted. |

---

### `POST /auth/change-password`

**Access:** Any signed-in user

Change the current password

Requires the current password. On success every session is terminated, so the client must sign in again. Limited to 5 attempts per hour.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `currentPassword` | string | **yes** |  |
| `newPassword` | string | **yes** |  |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Password changed; all sessions signed out. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |
| `429` | Rate limit for this tier exhausted. |

---

### `GET /auth/me`

**Access:** Any signed-in user

Get the signed-in user

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Current user. |
| `401` | Missing, invalid, expired or revoked access token. |

---

## Users

Profile management and admin user administration

### `GET /users/me`

**Access:** Any signed-in user

Get your profile

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Profile. |
| `401` | Missing, invalid, expired or revoked access token. |

---

### `PATCH /users/me`

**Access:** Any signed-in user

Update your profile

Accepts name, phone and `image` only. The schema is strict, so sending `role`, `status` or `email` is rejected with 422 rather than silently ignored - including the retired `avatarUrl`, which is now `image`.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `fullName` | string | no | maxLength 120. |
| `phone` | string | no |  |
| `image` | string | no | Profile picture URL. |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Updated profile. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |

---

### `POST /users/filter`

**Access:** Any signed-in user

Filter and page through users

Requires **`ROLE_ADMIN` or above** (so admins and owners).

A POST with a JSON body rather than a GET with a query string, because the filter set is open-ended: arrays of roles and statuses, date ranges, and whatever gets added later. Encoding that in a query string means repeated keys and bracket syntax every client has to agree on, and it runs into URL length limits.

Returns **complete user records**, not a trimmed projection - minus the secrets, which are never serialised at all.

Soft-deleted accounts are excluded unless `includeDeleted` is true, or `status` explicitly asks for them. The body is strict: an unknown filter key is a 422 rather than being quietly ignored, so a typo in a filter cannot silently widen the result set.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `page` | integer | no | Zero-based - the first page is 0. Default `0`. min 0. |
| `limit` | integer | no | Default `20`. min 1, max 100. |
| `search` | string | no | Prefix match on first and last name, contains match on email. Regex metacharacters are escaped and treated as literal text. |
| `role` | `ROLE_CUSTOMER` \| `ROLE_MODERATOR` \| `ROLE_ADMIN` \| `ROLE_OWNER` *(or array)* | no | One role or a list. |
| `status` | `ACTIVE` \| `SUSPENDED` \| `DELETED` *(or array)* | no |  |
| `emailVerified` | boolean | no |  |
| `createdFrom` | string | no |  |
| `createdTo` | string | no |  |
| `sortBy` | `createdAt` \| `lastLoginAt` \| `fullName` \| `email` \| `role` \| `status` | no | Default `"createdAt"`. |
| `sortOrder` | `asc` \| `desc` | no | Default `"desc"`. |
| `includeDeleted` | boolean | no | Include soft-deleted accounts. Default `false`. |

```json
{}
```

*Active staff, alphabetical*

```json
{
  "role": [
    "ROLE_MODERATOR",
    "ROLE_ADMIN",
    "ROLE_OWNER"
  ],
  "status": "ACTIVE",
  "sortBy": "fullName",
  "sortOrder": "asc"
}
```

*Search with a date range*

```json
{
  "search": "raju",
  "createdFrom": "2026-01-01",
  "limit": 50
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Paginated users. |
| `401` | Missing, invalid, expired or revoked access token. |
| `403` | Authenticated, but not allowed to perform this action. |
| `422` | Request failed schema validation. |

---

### `POST /users/create`

**Access:** Any signed-in user

Create a user account (owner only)

Creates an account directly, bypassing the email-verification signup flow. **Requires `ROLE_OWNER`** - not admin. Creating accounts outright, skipping verification and choosing the role, is the most privileged write in the API.

Creation and filtering sit on sibling paths (`/users/create` and `/users/filter`) rather than sharing `POST /users`, so neither can be triggered by malforming the other's body.

The account is created **already verified** and can sign in immediately. `password` is optional - omit it and one is generated, emailed to the new user, and returned **once** as `generatedPassword`. A password the caller supplied is never echoed back.

The role must be **below** the creator's own rank, the same rule `/users/{id}/role` enforces, so an owner can create admins but not another owner.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `fullName` | string | **yes** | maxLength 120. |
| `email` | string | **yes** |  |
| `password` | string | no | Optional. Generated automatically when omitted. minLength 8. |
| `role` | `ROLE_CUSTOMER` \| `ROLE_MODERATOR` \| `ROLE_ADMIN` \| `ROLE_OWNER` | no | Roles are ranked, and permissions accumulate upwards: `ROLE_CUSTOMER` < `ROLE_MODERATOR` < `ROLE_ADMIN` < `ROLE_OWNER`. An endpoint documented as requiring `ROLE_ADMIN` also admits `ROLE_OWNER`. Nobody may assign a role at or above their own rank. |
| `phone` | string | no |  |
| `image` | string | no |  |
| `sendEmail` | boolean | no | Set false to create the account silently. Default `true`. |

**Responses**

| Status | Meaning |
| --- | --- |
| `201` | User created. |
| `401` | Missing, invalid, expired or revoked access token. |
| `403` | Authenticated, but not allowed to perform this action. |
| `409` | Conflicts with existing state, e.g. a duplicate unique field. |
| `422` | Request failed schema validation. |

---

### `GET /users/{id}`

**Access:** Moderator and above

Get a user by id (self, or ROLE_MODERATOR and above)

A customer requesting someone else's id gets 404 rather than 403 - a 403 would confirm the account exists, and sequential integer ids make walking the range trivial.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | integer | **yes** | Integer user id. e.g. `1003` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | User. |
| `401` | Missing, invalid, expired or revoked access token. |
| `404` | Resource does not exist. |

---

### `DELETE /users/{id}`

**Access:** Admin and above

Soft delete a user (ROLE_ADMIN and above)

Sets `status` to `DELETED`, stamps `deletedAt` and revokes every session. **The row is kept**, because orders, reviews and audit trails reference it - removing it would leave dangling references and rewrite history. The email stays claimed, so the address cannot be re-registered by someone else and inherit the previous person's footprint.

Reversible: `PATCH /users/{id}/status` with `ACTIVE` restores the account and clears `deletedAt`. For irreversible removal see `DELETE /users/{id}/permanent`.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | integer | **yes** | Integer user id. e.g. `1003` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | User soft deleted. |
| `400` | You cannot delete your own account. |
| `403` | Authenticated, but not allowed to perform this action. |
| `404` | Resource does not exist. |
| `409` | Already deleted, or this is the last remaining owner. |

---

### `DELETE /users/{id}/permanent`

**Access:** Any signed-in user

Permanently delete a user (owner only)

**Irreversible.** Removes the document from the database outright.

Owner-only and on its own path rather than a `?force=true` flag, because an irreversible action should be impossible to trigger by fumbling a query parameter. Anything referencing this user by id becomes a dangling reference, which is exactly why the soft delete is the default and this is reserved for erasure requests and genuine mistakes.

Unlike the soft delete, this frees the email address for reuse.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | integer | **yes** | Integer user id. e.g. `1003` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | User permanently deleted. Only what was removed is returned. |
| `400` | Malformed request. |
| `403` | Authenticated, but not allowed to perform this action. |
| `404` | Resource does not exist. |
| `409` | Conflicts with existing state, e.g. a duplicate unique field. |

---

### `PATCH /users/{id}/role`

**Access:** Any signed-in user

Change a user's role

Requires **`ROLE_ADMIN` or above** (admins and owners), and is guarded three ways: you cannot change your own role, you cannot assign a role at or above your own rank, and you cannot modify a user senior to you. So an admin may create moderators but never another admin, and only an owner mints owners. The last remaining owner cannot be demoted.

Bumps the target's token version, so the new role applies on their very next request rather than whenever their token happens to expire.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | integer | **yes** | Integer user id. e.g. `1003` |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `role` | `ROLE_CUSTOMER` \| `ROLE_MODERATOR` \| `ROLE_ADMIN` \| `ROLE_OWNER` | **yes** | Roles are ranked, and permissions accumulate upwards: `ROLE_CUSTOMER` < `ROLE_MODERATOR` < `ROLE_ADMIN` < `ROLE_OWNER`. An endpoint documented as requiring `ROLE_ADMIN` also admits `ROLE_OWNER`. Nobody may assign a role at or above their own rank. |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Role updated. |
| `400` | Malformed request. |
| `403` | Target is senior to you, or the requested role is at or above your own rank. |
| `409` | Conflicts with existing state, e.g. a duplicate unique field. |

---

### `PATCH /users/{id}/status`

**Access:** Any signed-in user

Suspend or reactivate an account

Requires `ROLE_ADMIN` or above. Suspending revokes every session the user holds; reactivating clears `deletedAt`, so this is also how a soft-deleted account is restored.

Only `ACTIVE` and `SUSPENDED` are accepted. `DELETED` is reachable solely through `DELETE /users/{id}`, so a removal always goes through the code that stamps the deletion time.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | integer | **yes** | Integer user id. e.g. `1003` |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `status` | `ACTIVE` \| `SUSPENDED` | **yes** |  |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Status updated. |
| `400` | Malformed request. |
| `403` | Authenticated, but not allowed to perform this action. |
| `409` | Conflicts with existing state, e.g. a duplicate unique field. |

---

## Media

Cloudinary-backed file uploads

### `POST /media/upload`

**Access:** Any signed-in user

Upload a file

`multipart/form-data` with the file on a field named `file`. Open to any authenticated role - a customer needs it for their own profile picture. Deleting and listing everything are the privileged operations.

**Maximum 3MB.** The limit is enforced while the request streams, so an oversized upload is rejected with `413 FILE_TOO_LARGE` without ever being buffered - the difference between a cheap rejection and a way to exhaust the process.

Allowed types are `image/jpeg`, `image/png`, `image/webp`, `image/gif` and `image/avif` - an explicit list, not an `image/*` wildcard, because that wildcard admits SVG, which can carry script and becomes stored XSS when served back from your own domain. The declared Content-Type is only a first pass; Cloudinary decodes the file and rejects anything that is not really the image it claims to be.

**Every image is converted to WebP before storage**, at quality 80 and capped at 2000px on the longest edge (downscale only - a small avatar is never blown up). Typical savings run 25-65% against the original; an oversized phone photo can drop far further. The response reports `originalFormat` and `originalBytes` alongside the stored `bytes`, so the saving is visible. Animated GIFs become animated WebP rather than being flattened to one frame.

The conversion is also the real type check. A `Content-Type` header is client-supplied and forged in a second, so the decode is what actually establishes a file is an image - anything undecodable is rejected with `400 INVALID_IMAGE` before it is stored. Re-encoding additionally strips EXIF (which routinely carries the GPS coordinates of where a photo was taken) and destroys anything smuggled into the original's metadata or trailing bytes.

On success the asset is stored in Cloudinary **and** a record is written here with a new integer `id`. If the record cannot be written the asset is deleted again, so a failure never leaves an unreferenced file accruing storage cost.

**Request body** — `multipart/form-data`, file on the `file` field.

**Responses**

| Status | Meaning |
| --- | --- |
| `201` | Uploaded and recorded. |
| `400` | No file sent, a disallowed type, or bytes that are not a readable image. |
| `401` | Missing, invalid, expired or revoked access token. |
| `413` | File exceeds the 3MB limit. |
| `502` | The storage provider rejected or could not accept the file. |
| `503` | Cloudinary is not configured on this server. |

---

### `POST /media/my`

**Access:** Any signed-in user

List your own uploads

Any authenticated role. The uploader is pinned from the access token, not read from the body, so there is no field to tamper with - and `uploadedBy` is not part of this schema at all, so sending it is a 422 rather than something that looks like it might work.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `page` | integer | no | Zero-based - the first page is 0. Default `0`. min 0. |
| `limit` | integer | no | Default `20`. min 1, max 100. |
| `search` | string | no | Matches the original filename. Regex metacharacters are escaped and treated as literal text. |
| `type` | `IMAGE` | no |  |
| `tag` | string *(or array)* | no |  |
| `format` | string | no | Always `webp` - every upload is re-encoded before storage. |
| `minBytes` | integer | no |  |
| `maxBytes` | integer | no |  |
| `createdFrom` | string | no |  |
| `createdTo` | string | no |  |
| `sortBy` | `createdAt` \| `bytes` \| `originalFilename` | no | Default `"createdAt"`. |
| `sortOrder` | `asc` \| `desc` | no | Default `"desc"`. |

```json
{}
```

*Only avatars, oldest first*

```json
{
  "tag": "avatar",
  "sortOrder": "asc"
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Paginated media. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |

---

### `POST /media/filter`

**Access:** Any signed-in user

List every user's uploads

Requires **`ROLE_ADMIN` or above** (so admins and owners). Same filter shape as `/media/my`, plus `uploadedBy` to narrow to one uploader.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `page` | integer | no | Zero-based - the first page is 0. Default `0`. min 0. |
| `limit` | integer | no | Default `20`. min 1, max 100. |
| `search` | string | no | Matches the original filename. Regex metacharacters are escaped and treated as literal text. |
| `type` | `IMAGE` | no |  |
| `tag` | string *(or array)* | no |  |
| `format` | string | no | Always `webp` - every upload is re-encoded before storage. |
| `minBytes` | integer | no |  |
| `maxBytes` | integer | no |  |
| `createdFrom` | string | no |  |
| `createdTo` | string | no |  |
| `sortBy` | `createdAt` \| `bytes` \| `originalFilename` | no | Default `"createdAt"`. |
| `sortOrder` | `asc` \| `desc` | no | Default `"desc"`. |
| `uploadedBy` | integer | no | Narrow to a single uploader's files. |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Paginated media. |
| `401` | Missing, invalid, expired or revoked access token. |
| `403` | Authenticated, but not allowed to perform this action. |
| `422` | Request failed schema validation. |

---

### `DELETE /media/{id}`

**Access:** Any signed-in user

Delete a file

Requires **`ROLE_ADMIN` or above**. Removes the asset from Cloudinary and then the record here.

That order is deliberate: if the record were deleted first and the remote delete then failed, the file would be stranded with nothing pointing at it. This way a provider failure leaves both sides intact and the call can simply be retried.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | integer | **yes** | Integer media id. e.g. `1004` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Deleted. Only what was removed is returned. |
| `401` | Missing, invalid, expired or revoked access token. |
| `403` | Authenticated, but not allowed to perform this action. |
| `404` | Resource does not exist. |
| `422` | Request failed schema validation. |

---

## Products

Product management for moderators, admins and owners

### `POST /products`

**Access:** Any signed-in user

Create a product

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | **yes** |  |
| `slug` | string | **yes** |  |
| `description` | string | **yes** |  |
| `shortDescription` | string | no |  |
| `categoryIds` | string[] | **yes** | Direct category assignments. Send the most specific category; hierarchy is derived from parentId. minItems 1, maxItems 20. |
| `brandId` | string | no |  |
| `sku` | string | no |  |
| `currency` | `BDT` | no | Default `"BDT"`. |
| `sellingPrice` | number | **yes** | min 0. |
| `originalPrice` | number | no | min 0. |
| `stock` | object | no |  |
| `stock.quantity` | integer | no | min 0. |
| `stock.trackInventory` | boolean | no |  |
| `stock.allowBackorder` | boolean | no |  |
| `stock.lowStockThreshold` | integer | no | min 0. |
| `stock.status` | `IN_STOCK` \| `OUT_OF_STOCK` \| `BACKORDER` | no |  |
| `status` | `DRAFT` \| `ACTIVE` \| `OUT_OF_STOCK` | no |  |
| `visibility` | `PUBLIC` \| `HIDDEN` | no |  |
| `featured` | boolean | no |  |
| `tags` | string[] | no |  |
| `attributes` | object[] | no | The product's spec table, as an **ordered list of titled groups** - the order is the display order. Each group is a block of the table, e.g. "General Info" then "Care". **A key may appear in only one group.** Filters query `attributes.options.<key>` across every group, so the same key in two groups would make "which value" ambiguous at query time; it is rejected with 422. Group titles must be unique too. maxItems 20. |
| `attributes[].title` | string | **yes** | maxLength 120. |
| `attributes[].options` | object | **yes** | Attribute key to value. A value may be a scalar or a list. |
| `shipping` | object | no |  |
| `shipping.requiresShipping` | boolean | no |  |
| `shipping.freeShipping` | boolean | no |  |
| `shipping.weight` | object | no |  |
| `shipping.weight.value` | number | no | min 0. |
| `shipping.weight.unit` | `g` \| `kg` \| `oz` \| `lb` | no |  |
| `shipping.dimensions` | object | no |  |
| `shipping.dimensions.length` | number | no | min 0. |
| `shipping.dimensions.width` | number | no | min 0. |
| `shipping.dimensions.height` | number | no | min 0. |
| `shipping.dimensions.unit` | `mm` \| `cm` \| `m` \| `in` | no |  |
| `thumbnail` | object | **yes** |  |
| `thumbnail.alt` | string | **yes** |  |
| `thumbnail.src` | string | **yes** |  |
| `thumbnail.id` | integer | no | Optional media id; omitted when no media record is linked. min 1. |
| `images` | object[] | no |  |
| `images[].alt` | string | **yes** |  |
| `images[].src` | string | **yes** |  |
| `images[].id` | integer | no | Optional media id; omitted when no media record is linked. min 1. |
| `seo` | object | no |  |
| `seo.title` | string | no |  |
| `seo.description` | string | no |  |
| `seo.keywords` | string[] | no |  |
| `seo.canonicalUrl` | string | no |  |
| `seo.noIndex` | boolean | no |  |
| `seo.noFollow` | boolean | no |  |
| `seo.ogTitle` | string | no |  |
| `seo.ogDescription` | string | no |  |
| `seo.ogImage` | string | no |  |
| `seo.twitterTitle` | string | no |  |
| `seo.twitterDescription` | string | no |  |
| `seo.twitterImage` | string | no |  |
| `productType` | `SIMPLE` \| `VARIABLE` | no |  |
| `variationOptions` | object | no | Required for VARIABLE products. Variations are persisted only during POST /products. |
| `variations` | object[] | no | Generated variation rows to save with this product. Use this instead of variationOptions when prices, stock, SKU or image differ per variation. |
| `variations[].options` | object | **yes** |  |
| `variations[].sku` | string | no |  |
| `variations[].barcode` | string | no |  |
| `variations[].sellingPrice` | number | no | min 0. |
| `variations[].originalPrice` | number | no | min 0. |
| `variations[].stock` | object | no |  |
| `variations[].stock.quantity` | integer | no | min 0. |
| `variations[].stock.trackInventory` | boolean | no |  |
| `variations[].stock.allowBackorder` | boolean | no |  |
| `variations[].stock.lowStockThreshold` | integer | no | min 0. |
| `variations[].stock.status` | `IN_STOCK` \| `OUT_OF_STOCK` \| `BACKORDER` | no |  |
| `variations[].status` | `DRAFT` \| `ACTIVE` \| `OUT_OF_STOCK` | no |  |
| `variations[].image` | object | no |  |
| `variations[].image.alt` | string | **yes** |  |
| `variations[].image.src` | string | **yes** |  |
| `variations[].image.id` | integer | no | Optional media id; omitted when no media record is linked. min 1. |
| `variations[].sortOrder` | integer | no | min 0. |

```json
{
  "name": "Nike Sports T-Shirt",
  "slug": "nike-sports-t-shirt",
  "description": "Breathable performance t-shirt for everyday training.",
  "shortDescription": "Lightweight performance t-shirt.",
  "categoryIds": [
    "66bca1f8d7432e0012345678"
  ],
  "brandId": "66bca1f8d7432e0012345679",
  "productType": "VARIABLE",
  "sku": "NIKE-SPORTS",
  "currency": "BDT",
  "sellingPrice": 1299,
  "originalPrice": 1499,
  "stock": {
    "quantity": 20,
    "trackInventory": true,
    "allowBackorder": false,
    "lowStockThreshold": 5,
    "status": "IN_STOCK"
  },
  "status": "ACTIVE",
  "visibility": "PUBLIC",
  "featured": true,
  "tags": [
    "sportswear",
    "training"
  ],
  "attributes": [
    {
      "title": "General Info",
      "options": {
        "material": "cotton",
        "fit": "regular"
      }
    },
    {
      "title": "Care",
      "options": {
        "wash": "cold",
        "iron": "low"
      }
    }
  ],
  "variations": [
    {
      "options": {
        "color": "black",
        "size": "m"
      },
      "sku": "NIKE-SPORTS-BLACK-M",
      "sellingPrice": 1299,
      "originalPrice": 1499,
      "stock": {
        "quantity": 8,
        "trackInventory": true,
        "allowBackorder": false,
        "lowStockThreshold": 2,
        "status": "IN_STOCK"
      },
      "status": "ACTIVE",
      "image": {
        "alt": "Black medium t-shirt",
        "src": "https://cdn.example.com/products/nike-shirt-black-m.webp",
        "id": 1050
      },
      "sortOrder": 0
    },
    {
      "options": {
        "color": "white",
        "size": "l"
      },
      "sku": "NIKE-SPORTS-WHITE-L",
      "sellingPrice": 1349,
      "stock": {
        "quantity": 5,
        "status": "IN_STOCK"
      },
      "status": "ACTIVE",
      "image": {
        "alt": "White large t-shirt",
        "src": "https://cdn.example.com/products/nike-shirt-white-l.webp"
      },
      "sortOrder": 1
    }
  ],
  "shipping": {
    "requiresShipping": true,
    "freeShipping": false,
    "weight": {
      "value": 0.25,
      "unit": "kg"
    },
    "dimensions": {
      "length": 30,
      "width": 24,
      "height": 3,
      "unit": "cm"
    }
  },
  "thumbnail": {
    "alt": "Black Nike sports t-shirt",
    "src": "https://cdn.example.com/products/nike-shirt.webp",
    "id": 1042
  },
  "images": [
    {
      "alt": "Front view",
      "src": "https://cdn.example.com/products/nike-shirt-front.webp",
      "id": 1043
    },
    {
      "alt": "Back view",
      "src": "https://cdn.example.com/products/nike-shirt-back.webp"
    }
  ],
  "seo": {
    "title": "Nike Sports T-Shirt | Buy Online",
    "description": "Shop the Nike Sports T-Shirt for training and everyday performance.",
    "keywords": [
      "nike t-shirt",
      "sports t-shirt",
      "training shirt"
    ],
    "canonicalUrl": "https://gadgetsimp.dev/products/nike-sports-t-shirt",
    "noIndex": false,
    "noFollow": false,
    "ogTitle": "Nike Sports T-Shirt",
    "ogDescription": "Lightweight performance t-shirt for training.",
    "ogImage": "https://cdn.example.com/products/nike-shirt-og.webp",
    "twitterTitle": "Nike Sports T-Shirt",
    "twitterDescription": "Lightweight performance t-shirt for training.",
    "twitterImage": "https://cdn.example.com/products/nike-shirt-twitter.webp"
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `201` | Product created. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |

---

### `PATCH /products/{id}/general`

**Access:** Any signed-in user

Update general details

One panel of the admin product form. `PUT /products/{id}` replaces the whole document, so saving a single panel through it means round-tripping every field - and anything the form did not load comes back as a silent reset. These section patches save only what the panel owns.

`productType` is not accepted: flipping VARIABLE to SIMPLE would orphan every generated SKU. Setting `status` to ACTIVE stamps `publishedAt`; setting it to DRAFT clears it. Changing `categoryIds` revalidates the stored attributes against the new categories.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | no |  |
| `slug` | string | no |  |
| `brandId` | string | no | Nullable. |
| `categoryIds` | string[] | no |  |
| `sku` | string | no |  |
| `status` | `DRAFT` \| `ACTIVE` \| `OUT_OF_STOCK` | no |  |
| `visibility` | `PUBLIC` \| `HIDDEN` | no |  |
| `featured` | boolean | no |  |

```json
{
  "name": "Nike Sports T-Shirt",
  "slug": "nike-sports-t-shirt",
  "brandId": "6712f0c2a1b4d3e5f6a7b8c9",
  "categoryIds": [
    "6712f0c2a1b4d3e5f6a7b8c9"
  ],
  "status": "ACTIVE",
  "visibility": "PUBLIC",
  "featured": true
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | General details updated. |
| `401` | Missing, invalid, expired or revoked access token. |
| `404` | Resource does not exist. |
| `422` | Request failed schema validation. |

---

### `PATCH /products/{id}/description`

**Access:** Any signed-in user

Update descriptions

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `description` | string | no |  |
| `shortDescription` | string | no | Nullable. |

```json
{
  "description": "Breathable performance t-shirt for everyday training, cut for movement.",
  "shortDescription": "Lightweight performance t-shirt."
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Description updated. |
| `404` | Resource does not exist. |
| `422` | Request failed schema validation. |

---

### `PATCH /products/{id}/pricing`

**Access:** Any signed-in user

Update pricing

`originalPrice` must stay at or above `sellingPrice`, and the rule is enforced against the **stored** record - so raising `sellingPrice` alone past the existing `originalPrice` is rejected with `PRODUCT_PRICE_ORDER_INVALID`. Send `originalPrice: null` to remove the struck-through price.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `sellingPrice` | number | no | min 0. |
| `originalPrice` | number | no | min 0. Nullable. |
| `currency` | `BDT` | no |  |

```json
{
  "sellingPrice": 1299,
  "originalPrice": 1499
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Pricing updated. |
| `404` | Resource does not exist. |
| `422` | Validation failed, or the price order is inconsistent with the stored record. |

---

### `PATCH /products/{id}/stock`

**Access:** Any signed-in user

Update stock

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `stock` | object | **yes** |  |
| `stock.quantity` | integer | no | min 0. |
| `stock.trackInventory` | boolean | no |  |
| `stock.allowBackorder` | boolean | no |  |
| `stock.lowStockThreshold` | integer | no | min 0. |
| `stock.status` | `IN_STOCK` \| `OUT_OF_STOCK` \| `BACKORDER` | no |  |

```json
{
  "stock": {
    "quantity": 120,
    "lowStockThreshold": 5,
    "trackInventory": true
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Stock updated. |
| `404` | Resource does not exist. |
| `422` | Request failed schema validation. |

---

### `PATCH /products/{id}/attributes`

**Access:** Any signed-in user

Update attributes and tags

Attributes are revalidated against the categories already on the product, so a key the category does not configure is rejected with `PRODUCT_ATTRIBUTE_INVALID`.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `attributes` | object[] | no | The product's spec table, as an **ordered list of titled groups** - the order is the display order. Each group is a block of the table, e.g. "General Info" then "Care". **A key may appear in only one group.** Filters query `attributes.options.<key>` across every group, so the same key in two groups would make "which value" ambiguous at query time; it is rejected with 422. Group titles must be unique too. maxItems 20. |
| `attributes[].title` | string | **yes** | maxLength 120. |
| `attributes[].options` | object | **yes** | Attribute key to value. A value may be a scalar or a list. |
| `tags` | string[] | no |  |

```json
{
  "attributes": [
    {
      "title": "General Info",
      "options": {
        "material": "cotton"
      }
    }
  ],
  "tags": [
    "sportswear",
    "training"
  ]
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Attributes and tags updated. |
| `404` | Resource does not exist. |
| `422` | Request failed schema validation. |

---

### `PATCH /products/{id}/media`

**Access:** Any signed-in user

Update thumbnail and gallery

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `thumbnail` | object | no |  |
| `thumbnail.alt` | string | **yes** |  |
| `thumbnail.src` | string | **yes** |  |
| `thumbnail.id` | integer | no | Optional media id; omitted when no media record is linked. min 1. |
| `images` | object[] | no |  |
| `images[].alt` | string | **yes** |  |
| `images[].src` | string | **yes** |  |
| `images[].id` | integer | no | Optional media id; omitted when no media record is linked. min 1. |

```json
{
  "thumbnail": {
    "alt": "Black Nike sports t-shirt",
    "src": "https://cdn.example.com/products/nike-shirt.webp",
    "id": 1042
  },
  "images": [
    {
      "alt": "Front view",
      "src": "https://cdn.example.com/products/nike-shirt-front.webp",
      "id": 1043
    }
  ]
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Media updated. |
| `404` | Resource does not exist. |
| `422` | Request failed schema validation. |

---

### `PATCH /products/{id}/featured`

**Access:** Any signed-in user

Feature or unfeature a product

A one-decision toggle, for a product table's quick actions.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `featured` | boolean | **yes** |  |

```json
{
  "featured": true
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Featured flag updated. |
| `404` | Resource does not exist. |
| `422` | Request failed schema validation. |

---

### `PATCH /products/{id}/status`

**Access:** Any signed-in user

Publish, unpublish or hide a product

Setting `status` to ACTIVE stamps `publishedAt` if it was never set; setting DRAFT clears it. `visibility` controls whether a published product appears in the storefront at all.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `status` | `DRAFT` \| `ACTIVE` \| `OUT_OF_STOCK` | no |  |
| `visibility` | `PUBLIC` \| `HIDDEN` | no |  |

```json
{
  "status": "ACTIVE",
  "visibility": "PUBLIC"
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Status updated. |
| `404` | Resource does not exist. |
| `422` | Request failed schema validation. |

---

### `PATCH /products/{id}/seo`

**Access:** Any signed-in user

Update SEO

Missing SEO fields are derived from the **stored** product - name, descriptions, slug, thumbnail and tags - so sending only a title still yields a complete SEO block.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `seo` | object | **yes** |  |
| `seo.title` | string | no |  |
| `seo.description` | string | no |  |
| `seo.keywords` | string[] | no |  |
| `seo.canonicalUrl` | string | no |  |
| `seo.noIndex` | boolean | no |  |
| `seo.noFollow` | boolean | no |  |
| `seo.ogTitle` | string | no |  |
| `seo.ogDescription` | string | no |  |
| `seo.ogImage` | string | no |  |
| `seo.twitterTitle` | string | no |  |
| `seo.twitterDescription` | string | no |  |
| `seo.twitterImage` | string | no |  |

```json
{
  "seo": {
    "title": "Nike Sports T-Shirt | Buy Online",
    "description": "Shop the Nike Sports T-Shirt for training and everyday performance.",
    "keywords": [
      "nike t-shirt",
      "sports t-shirt",
      "training shirt"
    ],
    "canonicalUrl": "https://gadgetsimp.dev/products/nike-sports-t-shirt",
    "noIndex": false,
    "noFollow": false,
    "ogTitle": "Nike Sports T-Shirt",
    "ogDescription": "Lightweight performance t-shirt for training.",
    "ogImage": "https://cdn.example.com/products/nike-shirt-og.webp",
    "twitterTitle": "Nike Sports T-Shirt",
    "twitterDescription": "Lightweight performance t-shirt for training.",
    "twitterImage": "https://cdn.example.com/products/nike-shirt-twitter.webp"
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | SEO updated. |
| `404` | Resource does not exist. |
| `422` | Request failed schema validation. |

---

### `POST /products/filter`

**Access:** Any signed-in user

Filter products for staff

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `categoryId` | string | no |  |
| `filters` | object | no |  |
| `search` | string | no |  |
| `sort` | object | no |  |
| `sort.field` | `relevance` \| `price` \| `name` \| `createdAt` | no |  |
| `sort.direction` | `asc` \| `desc` | no |  |
| `pagination` | object | no |  |
| `pagination.page` | integer | no | min 0. |
| `pagination.limit` | integer | no | min 1, max 100. |

```json
{
  "categoryId": "66bca1f8d7432e0012345678",
  "filters": {
    "brand": [
      "66bca1f8d7432e0012345679"
    ],
    "color": [
      "black"
    ],
    "size": [
      "m"
    ]
  },
  "search": "sports t-shirt",
  "sort": {
    "field": "price",
    "direction": "asc"
  },
  "pagination": {
    "page": 0,
    "limit": 24
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Paginated products with minimal categoryIds and brandId objects. |

---

### `GET /products/{id}`

**Access:** Any signed-in user

Get a product with minimal relationships and variations

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Product retrieved. |

---

### `PUT /products/{id}`

**Access:** Any signed-in user

Replace a product

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | **yes** |  |
| `slug` | string | **yes** |  |
| `description` | string | **yes** |  |
| `shortDescription` | string | no |  |
| `categoryIds` | string[] | **yes** | Direct category assignments. Send the most specific category; hierarchy is derived from parentId. minItems 1, maxItems 20. |
| `brandId` | string | no |  |
| `sku` | string | no |  |
| `currency` | `BDT` | no | Default `"BDT"`. |
| `sellingPrice` | number | **yes** | min 0. |
| `originalPrice` | number | no | min 0. |
| `stock` | object | no |  |
| `stock.quantity` | integer | no | min 0. |
| `stock.trackInventory` | boolean | no |  |
| `stock.allowBackorder` | boolean | no |  |
| `stock.lowStockThreshold` | integer | no | min 0. |
| `stock.status` | `IN_STOCK` \| `OUT_OF_STOCK` \| `BACKORDER` | no |  |
| `status` | `DRAFT` \| `ACTIVE` \| `OUT_OF_STOCK` | no |  |
| `visibility` | `PUBLIC` \| `HIDDEN` | no |  |
| `featured` | boolean | no |  |
| `tags` | string[] | no |  |
| `attributes` | object[] | no | The product's spec table, as an **ordered list of titled groups** - the order is the display order. Each group is a block of the table, e.g. "General Info" then "Care". **A key may appear in only one group.** Filters query `attributes.options.<key>` across every group, so the same key in two groups would make "which value" ambiguous at query time; it is rejected with 422. Group titles must be unique too. maxItems 20. |
| `attributes[].title` | string | **yes** | maxLength 120. |
| `attributes[].options` | object | **yes** | Attribute key to value. A value may be a scalar or a list. |
| `shipping` | object | no |  |
| `shipping.requiresShipping` | boolean | no |  |
| `shipping.freeShipping` | boolean | no |  |
| `shipping.weight` | object | no |  |
| `shipping.weight.value` | number | no | min 0. |
| `shipping.weight.unit` | `g` \| `kg` \| `oz` \| `lb` | no |  |
| `shipping.dimensions` | object | no |  |
| `shipping.dimensions.length` | number | no | min 0. |
| `shipping.dimensions.width` | number | no | min 0. |
| `shipping.dimensions.height` | number | no | min 0. |
| `shipping.dimensions.unit` | `mm` \| `cm` \| `m` \| `in` | no |  |
| `thumbnail` | object | **yes** |  |
| `thumbnail.alt` | string | **yes** |  |
| `thumbnail.src` | string | **yes** |  |
| `thumbnail.id` | integer | no | Optional media id; omitted when no media record is linked. min 1. |
| `images` | object[] | no |  |
| `images[].alt` | string | **yes** |  |
| `images[].src` | string | **yes** |  |
| `images[].id` | integer | no | Optional media id; omitted when no media record is linked. min 1. |
| `seo` | object | no |  |
| `seo.title` | string | no |  |
| `seo.description` | string | no |  |
| `seo.keywords` | string[] | no |  |
| `seo.canonicalUrl` | string | no |  |
| `seo.noIndex` | boolean | no |  |
| `seo.noFollow` | boolean | no |  |
| `seo.ogTitle` | string | no |  |
| `seo.ogDescription` | string | no |  |
| `seo.ogImage` | string | no |  |
| `seo.twitterTitle` | string | no |  |
| `seo.twitterDescription` | string | no |  |
| `seo.twitterImage` | string | no |  |
| `variationOptions` | object | no | Updates the product's variation option keys. Existing variation records are preserved. |

```json
{
  "name": "Nike Sports T-Shirt",
  "slug": "nike-sports-t-shirt",
  "description": "Updated breathable performance t-shirt for everyday training.",
  "shortDescription": "Lightweight performance t-shirt.",
  "categoryIds": [
    "66bca1f8d7432e0012345678"
  ],
  "brandId": "66bca1f8d7432e0012345679",
  "sku": "NIKE-SPORTS",
  "currency": "BDT",
  "sellingPrice": 1399,
  "originalPrice": 1599,
  "stock": {
    "quantity": 18,
    "trackInventory": true,
    "allowBackorder": false,
    "lowStockThreshold": 5,
    "status": "IN_STOCK"
  },
  "status": "ACTIVE",
  "visibility": "PUBLIC",
  "featured": true,
  "tags": [
    "sportswear",
    "training"
  ],
  "attributes": [
    {
      "title": "General Info",
      "options": {
        "material": "cotton",
        "fit": "regular"
      }
    },
    {
      "title": "Care",
      "options": {
        "wash": "cold",
        "iron": "low"
      }
    }
  ],
  "variationOptions": {
    "color": [
      "black",
      "white"
    ],
    "size": [
      "m",
      "l"
    ]
  },
  "shipping": {
    "requiresShipping": true,
    "freeShipping": false,
    "weight": {
      "value": 0.25,
      "unit": "kg"
    },
    "dimensions": {
      "length": 30,
      "width": 24,
      "height": 3,
      "unit": "cm"
    }
  },
  "thumbnail": {
    "alt": "Black Nike sports t-shirt",
    "src": "https://cdn.example.com/products/nike-shirt.webp",
    "id": 1042
  },
  "images": [
    {
      "alt": "Front view",
      "src": "https://cdn.example.com/products/nike-shirt-front.webp",
      "id": 1043
    },
    {
      "alt": "Back view",
      "src": "https://cdn.example.com/products/nike-shirt-back.webp"
    }
  ],
  "seo": {
    "title": "Nike Sports T-Shirt | Buy Online",
    "description": "Shop the Nike Sports T-Shirt for training and everyday performance.",
    "keywords": [
      "nike t-shirt",
      "sports t-shirt",
      "training shirt"
    ],
    "canonicalUrl": "https://gadgetsimp.dev/products/nike-sports-t-shirt",
    "noIndex": false,
    "noFollow": false,
    "ogTitle": "Nike Sports T-Shirt",
    "ogDescription": "Lightweight performance t-shirt for training.",
    "ogImage": "https://cdn.example.com/products/nike-shirt-og.webp",
    "twitterTitle": "Nike Sports T-Shirt",
    "twitterDescription": "Lightweight performance t-shirt for training.",
    "twitterImage": "https://cdn.example.com/products/nike-shirt-twitter.webp"
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Product replaced. |

---

### `DELETE /products/{id}`

**Access:** Any signed-in user

Archive a product and its variations

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Product archived. |

---

## Shop

Public storefront: browsing, filtering and product pages

### `POST /shop`

**Access:** Public

Browse the storefront

Public catalog listing. No authentication - a shopper browsing is not signed in. Only ACTIVE, PUBLIC, published products are ever returned, so drafts and hidden products cannot leak through this route.

POST rather than GET because the filter set is open-ended - arrays of attribute values, ranges, and whatever a category adds later. Encoding that in a query string means bracket syntax every client has to agree on, and it runs into URL length limits.

Returns the **lightweight** card shape. Fetch `GET /shop/{slug}` for full detail.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `categorySlugs` | string[] | no | One or more categories. Each expands to its whole subtree, so `electronics` also returns products filed under its children, and the results are unioned - which is what a landing page spanning several categories needs. |
| `brandSlugs` | string[] | no | Static filter. Matches any of the listed brands. |
| `search` | string | no |  |
| `price` | object | no | Static filter on the **effective** price, so a variable product is matched on its variant range rather than a price it does not have. |
| `price.min` | number | no |  |
| `price.max` | number | no |  |
| `inStock` | boolean | no | Static filter. Buyable right now. |
| `featured` | boolean | no | Static filter. |
| `filters` | object | no | Dynamic, category-driven attribute filters, keyed by attribute key. Values inside one filter are ORed; different filters are ANDed. A value is either a list or a `{min,max}` range. Requires `categorySlugs`, since attribute keys are resolved from the category configuration. Call `GET /shop/filter-options/{categorySlug}` to discover which keys and values apply. |
| `sort` | object | no |  |
| `sort.field` | `relevance` \| `price` \| `name` \| `createdAt` | no | Default `"createdAt"`. |
| `sort.direction` | `asc` \| `desc` | no | Default `"desc"`. |
| `pagination` | object | no |  |
| `pagination.page` | integer | no | Zero-based. Default `0`. min 0. |
| `pagination.limit` | integer | no | Default `24`. min 1, max 100. |

```json
{
  "categorySlugs": [
    "t-shirts"
  ],
  "brandSlugs": [
    "nike"
  ],
  "price": {
    "min": 500,
    "max": 2000
  },
  "inStock": true,
  "featured": false,
  "filters": {
    "color": [
      "black",
      "white"
    ],
    "size": [
      "m"
    ]
  },
  "sort": {
    "field": "price",
    "direction": "asc"
  },
  "pagination": {
    "page": 0,
    "limit": 24
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Paginated product cards. |
| `404` | One of the category or brand slugs does not exist. |
| `422` | Request failed schema validation. |
| `429` | Rate limit for this tier exhausted. |

---

### `POST /shop/categories`

**Access:** Public

Storefront categories for a home page or nav menu

Returns the **minimal** shape a category tile renders - id, name, slug, image - not the full record. Paginated, zero-based, like the rest of the API.

Two independent filters, because they answer different questions:

- **`showInHome`** is curation: has someone chosen to surface this? Omit it and the flag is ignored entirely, returning every category with something to sell. Send `true` for the curated home-page set.
- **"has at least one product"** is safety, and is applied by default. A tile leading to an empty grid is worse than one tile fewer. This counts the whole **subtree**, matching what the tile does when clicked - so a parent whose products all live in its children still appears.

Set **`forceCategories: true`** to skip the product check and return empty categories too - useful for an admin preview or a nav menu that wants the full taxonomy. Named explicitly so an empty category on a live home page is always a deliberate choice.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `showInHome` | boolean | no | Omit to ignore the flag; `true` for the curated home-page set. |
| `forceCategories` | boolean | no | Skip the "must have at least one product" rule. Default `false`. |
| `search` | string | no |  |
| `pagination` | object | no |  |
| `pagination.page` | integer | no | Default `0`. min 0. |
| `pagination.limit` | integer | no | Default `20`. min 1, max 100. |

```json
{
  "showInHome": true,
  "pagination": {
    "page": 0,
    "limit": 12
  }
}
```

*Every category with something to sell*

```json
{}
```

*Everything, including empty categories*

```json
{
  "forceCategories": true
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Paginated categories. |
| `422` | Request failed schema validation. |

---

### `GET /shop/filter-options/{categorySlug}`

**Access:** Public

Filter options and facet counts for a category

Drives the filter sidebar: which attributes apply to this category, which values exist, and how many products each value would return.

A **GET**, and therefore cacheable by the browser and any CDN in front - a category's sidebar is identical for every shopper and changes only when the catalog does. Counts come from the database under the same visibility rules as the listing, so a value showing "12" really does return 12 products.

For counts narrowed by filters the shopper has already applied, read the facets returned alongside the results of `POST /shop`.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `categorySlug` | path | string | **yes** |  e.g. `t-shirts` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Available filters with counts. |
| `404` | Resource does not exist. |
| `422` | Request failed schema validation. |

---

### `GET /shop/{slug}`

**Access:** Public

Full product detail by slug

The product page payload - full descriptions, attributes, gallery, variations and SEO.

Applies the same visibility gate as the listing, and answers **404** rather than 403 for a product that is draft, hidden or not yet published - otherwise a guessable slug would be a preview link for unreleased products.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `slug` | path | string | **yes** |  e.g. `nike-sports-t-shirt` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Full product. |
| `404` | Resource does not exist. |
| `422` | Request failed schema validation. |

---

## Cart

The signed-in shopper's basket: batch add, update, remove and clear

### `GET /cart`

**Access:** Any signed-in user

The signed-in shopper's cart

Returns every line priced and checked against the live catalog. A cart that has never been used answers 200 with an empty one rather than 404, and no row is written for a shopper who has only browsed.

**This read never fails on bad catalog state.** A product unpublished overnight, a variant withdrawn, a line holding more units than remain - all come back flagged in `issues` with `purchasable: false`, never as an error. The opposite would lock the shopper out of their own basket with no way to remove the offending item.

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | The cart. |
| `401` | Missing, invalid, expired or revoked access token. |
| `429` | Rate limit for this tier exhausted. |

---

### `DELETE /cart`

**Access:** Any signed-in user

Empty the cart

Removes every line in one call. Idempotent - clearing an already-empty cart succeeds - and answers with the empty cart so the client has the same shape it gets everywhere else.

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | The now-empty cart. |
| `401` | Missing, invalid, expired or revoked access token. |

---

### `GET /cart/count`

**Access:** Any signed-in user

Line and unit counts for the header badge

The two numbers a header badge needs, and nothing else. Separate from `GET /cart` because it runs on every page load of the site and has no business pricing lines or checking stock to answer "3".

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Counts. |
| `401` | Missing, invalid, expired or revoked access token. |

---

### `POST /cart/items`

**Access:** Any signed-in user

Add items in bulk

Always a batch, including the one-item case - `{ "items": [one] }`. A separate single-item endpoint would mean two implementations of the same rules, and the one used less is the one that drifts.

**Merging.** Adding something already in the cart increases that line's quantity rather than creating a duplicate row. The same product and variant sent twice in one batch is summed, not rejected, so a retried request or a double tap does the sensible thing.

**All or nothing.** If any item cannot be added the whole request is refused with 422 and one entry per offending item, each carrying a `code` (`PRODUCT_UNAVAILABLE`, `OUT_OF_STOCK`, `VARIANT_REQUIRED`, `VARIANT_NOT_ALLOWED`, `VARIANT_UNAVAILABLE`, `VARIANT_PRODUCT_MISMATCH`) and a `field` pointing at the item's position in the array you sent.

**Quantity is the exception** and is capped rather than refused, to the lower of remaining stock and 100 per line. Every cap comes back in `adjustments` - show it, or the shopper silently gets fewer than they asked for.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `items` | object[] | **yes** | minItems 1, maxItems 50. |
| `items[].productId` | string | **yes** |  |
| `items[].variantId` | string | no | **Required** for a VARIABLE product and **refused** for a SIMPLE one. A variable product is a family of SKUs, not something that can be picked and packed, so adding one without saying which option leaves the warehouse guessing. `null` and omitting it mean the same thing. Nullable. |
| `items[].quantity` | integer | no | Default `1`. min 1, max 100. |

```json
{
  "items": [
    {
      "productId": "6712f0c2a1b4d3e5f6a7b8c9",
      "variantId": "6712f0c2a1b4d3e5f6a7b8d1",
      "quantity": 2
    },
    {
      "productId": "6712f0c2a1b4d3e5f6a7b8ca",
      "quantity": 1
    }
  ]
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | The updated cart, plus any quantity adjustments. |
| `401` | Missing, invalid, expired or revoked access token. |
| `409` | The cart was written concurrently three times over. Retry. |
| `422` | One or more items could not be added, or the cart is full. |
| `429` | Rate limit for this tier exhausted. |

---

### `PATCH /cart/items`

**Access:** Any signed-in user

Update quantities in bulk

Sets absolute quantities - not deltas - for lines addressed by their `id`. **A quantity of 0 removes the line.**

Deliberately permissive about availability: the quantity of a line whose product has since been withdrawn can still be changed, because the alternative is a row the shopper can neither fix nor reduce. What it will not do is invent a line - an unknown `itemId` refuses the whole batch with `CART_ITEM_NOT_FOUND`, since silently ignoring it would leave the screen showing a number the server never accepted.

Quantities are capped to available stock the same way `POST` caps them, and every cap is reported in `adjustments`.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `items` | object[] | **yes** | minItems 1, maxItems 50. |
| `items[].itemId` | string | **yes** | The cart **line** id from `CartLine.id`, not a product id. |
| `items[].quantity` | integer | **yes** | **0 removes the line.** The stepper next to a cart row decrements to zero, and making the client notice that and switch endpoints mid-interaction is how "the last one will not delete" bugs happen. min 0, max 100. |

```json
{
  "items": [
    {
      "itemId": "6733a1b2c3d4e5f6a7b8c9d0",
      "quantity": 3
    },
    {
      "itemId": "6733a1b2c3d4e5f6a7b8c9d1",
      "quantity": 0
    }
  ]
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | The updated cart, plus any quantity adjustments. |
| `401` | Missing, invalid, expired or revoked access token. |
| `409` | The cart was written concurrently three times over. Retry. |
| `422` | An itemId is not in the cart, or a quantity is out of range. |
| `429` | Rate limit for this tier exhausted. |

---

### `DELETE /cart/items`

**Access:** Any signed-in user

Remove several lines at once

Removes every listed line in one call, rather than one request per row that can half succeed.

**Idempotent.** An id that is already gone is not an error - the only ways to reach that state are a double-tapped remove and a stale screen, and both should end with the item gone rather than with a dialog. Those ids come back in `notFound`, and `removed` counts what actually went.

**Note for clients:** this DELETE carries a JSON body. `fetch` handles that natively; axios needs `axios.delete(url, { data: { itemIds } })`, as a plain second argument is treated as config and silently dropped.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `itemIds` | string[] | **yes** | minItems 1, maxItems 50. |

```json
{
  "itemIds": [
    "6733a1b2c3d4e5f6a7b8c9d0",
    "6733a1b2c3d4e5f6a7b8c9d1"
  ]
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | The updated cart. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |
| `429` | Rate limit for this tier exhausted. |

---

## Wishlist

Saved products for the signed-in shopper

### `POST /wishlist/filter`

**Access:** Any signed-in user

The caller's saved products, with live product data

Paginated and zero-based, newest-saved first by default - which is what a wishlist is, a list in the order you saved things.

Product data is resolved on every read, never stored, so a saved item can never show last month's price.

**Filters are a smaller set than `POST /shop` offers, on purpose.** Category and brand facets are absent: a category on the storefront expands to its whole subtree, and supporting a flat version here would mean the same parameter meaning two different things in two endpoints. Search, price, stock and sort cover what a list of a few dozen saved products needs.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `search` | string | no | Matches the product name. maxLength 160. |
| `price` | object | no | Filters the **effective** price, so a variable product is matched on its variant range rather than a price it does not have. |
| `price.min` | number | no | min 0. |
| `price.max` | number | no | min 0. |
| `inStock` | boolean | no | Buyable right now. Opt-in, never implied - saved items are routinely out of stock, and that is half the reason people save them. |
| `availableOnly` | boolean | no | Drop entries whose product has been withdrawn. Off by default so they stay removable. Default `false`. |
| `sort` | object | no |  |
| `sort.field` | `addedAt` \| `price` \| `name` | no | Default `"addedAt"`. |
| `sort.direction` | `asc` \| `desc` | no | Default `"desc"`. |
| `pagination` | object | no |  |
| `pagination.page` | integer | no | Zero-based. Default `0`. min 0. |
| `pagination.limit` | integer | no | Default `20`. min 1, max 100. |

```json
{
  "search": "t-shirt",
  "price": {
    "min": 500,
    "max": 2000
  },
  "inStock": true,
  "availableOnly": false,
  "sort": {
    "field": "addedAt",
    "direction": "desc"
  },
  "pagination": {
    "page": 0,
    "limit": 20
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Paginated saved products. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |

---

### `GET /wishlist/ids`

**Access:** Any signed-in user

Every saved product id, and nothing else

The endpoint a storefront grid calls once on load to fill in its heart icons. Asking the paginated listing for that would ship a hundred product cards to render a hundred booleans; this is one projected query against an index with no join to the catalog at all.

Unpaginated on purpose - the list is capped at 200 ids, a few kilobytes. Newest-saved first.

Returns ids for withdrawn products too, since the heart on a product page should still read as saved.

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | The ids. |
| `401` | Missing, invalid, expired or revoked access token. |

---

### `POST /wishlist/items`

**Access:** Any signed-in user

Save products

Takes a batch, including the one-item case. **Idempotent** - re-saving something already on the list is not an error, because a client rendering hearts from a cached id list will legitimately send one that is already saved. The response separates `added` from `alreadySaved`.

**No `variantId`, anywhere in this module.** A wishlist records "I want this thing"; which size or colour is a decision made at the point of buying, and storing one would mean a saved item vanishing when that particular SKU was discontinued even though the product is still on sale.

An unavailable product refuses the whole batch with 422, naming each offending position. Note that **out of stock is not a reason to refuse** - saving something precisely because it is unavailable today is half the point of a wishlist - so the gate here is visibility only, where the cart's is visibility and stock.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `productIds` | string[] | **yes** | minItems 1, maxItems 50. |

```json
{
  "productIds": [
    "6712f0c2a1b4d3e5f6a7b8c9",
    "6712f0c2a1b4d3e5f6a7b8ca"
  ]
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Saved. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | A product is unavailable (`WISHLIST_ITEMS_INVALID`), or the list is full (`WISHLIST_FULL`). |

---

### `DELETE /wishlist/items`

**Access:** Any signed-in user

Remove saved products

Batch remove, by **product id** - there is no separate entry id to keep track of.

**Idempotent**: an id that is not on the list is not an error, since the only ways to reach that state are a double tap and a stale screen, and both should end with the item gone. Works for withdrawn products too, which is what keeps an unavailable row removable.

**Note for clients:** this DELETE carries a JSON body. `fetch` handles that natively; axios needs `axios.delete(url, { data: { productIds } })`, as a plain second argument is treated as config and silently dropped.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `productIds` | string[] | **yes** | minItems 1, maxItems 50. |

```json
{
  "productIds": [
    "6712f0c2a1b4d3e5f6a7b8c9"
  ]
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Removed. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |

---

### `POST /wishlist/toggle`

**Access:** Any signed-in user

Toggle one product - the heart icon

Saved becomes unsaved, unsaved becomes saved. **The caller does not say which way**, and that is the point: the button is usually rendered from an id list that may be seconds stale, so a client asserting "add" against a list that already has it would be wrong. Letting the server decide from current state makes a double tap self-correcting.

Answers with the resulting state, so the icon can be set from the response rather than guessed.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `productId` | string | **yes** |  |

```json
{
  "productId": "6712f0c2a1b4d3e5f6a7b8c9"
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | The resulting state. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | The product is unavailable, or the list is full. |

---

### `DELETE /wishlist`

**Access:** Any signed-in user

Remove everything

Idempotent - clearing an already-empty wishlist succeeds.

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Cleared. |
| `401` | Missing, invalid, expired or revoked access token. |

---

## Orders

Checkout and a customer's own order history

### `POST /orders`

**Access:** Public

Place an order

Works **signed in or as a guest** - a shopper should not have to create an account to buy something. A bearer token is used when present and links the order to that account; without one the order is a guest order, identified by the contact details on it.

**Pricing is entirely server-side.** No price field is accepted anywhere in the request body, and the schema is strict, so sending one is rejected rather than ignored. Unit prices come from the product or variant, and the subtotal, discount and total are computed here and written onto the order as a frozen record.

**Stock is reserved as the order is placed**, atomically per line. If any line cannot be satisfied the whole order is refused with 422 and nothing is reserved - an order is a commitment, so a quantity that cannot be met is the wrong order rather than something to quietly reduce. Reserved units are returned to the catalog if the order is later CANCELED or RETURNED.

**Guest account creation.** With `createAccount: true` and an `email`, a verification message is sent after the order is placed. The flow from there is deliberately two-step:

1. The customer clicks the emailed link; the frontend posts the token to `POST /auth/verify-email`.
2. That responds **200 with `code: "REQUIRED_PASSWORD"`** and a `registrationToken` - and **no session**, because a link that arrived by email is not proof of anything but mailbox access.
3. The frontend opens a password modal and posts the password plus that token to `POST /auth/complete-registration`, which creates the account, signs them in, and attaches the order that started all this to it. No second verification email.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `items` | object[] | **yes** | minItems 1, maxItems 50. |
| `items[].productId` | string | **yes** |  |
| `items[].variantId` | string | no | **Required** for a VARIABLE product and **refused** for a SIMPLE one - the same rule the cart applies, from the same code, so anything addable to a cart is orderable. Nullable. |
| `items[].quantity` | integer | **yes** | min 1, max 100. |
| `contact` | object | **yes** | Both required - a cash-on-delivery order that cannot be phoned cannot be delivered. |
| `contact.name` | string | **yes** | maxLength 120. |
| `contact.phone` | string | **yes** |  |
| `shippingAddress` | object | **yes** | Structured rather than one free-text blob, because a courier integration needs the city and postcode as fields and splitting a blob apart later is guesswork. `line1` and `city` are the minimum a courier can act on; the rest are optional because addresses outside a dense city often genuinely have no postcode, and demanding one only teaches people to type "n/a". |
| `shippingAddress.line1` | string | **yes** | maxLength 240. |
| `shippingAddress.line2` | string | no | maxLength 240. |
| `shippingAddress.area` | string | no | maxLength 120. |
| `shippingAddress.city` | string | **yes** | maxLength 120. |
| `shippingAddress.district` | string | no | maxLength 120. |
| `shippingAddress.postalCode` | string | no | maxLength 24. |
| `shippingAddress.country` | string | no | Default `"Bangladesh"`. maxLength 80. |
| `note` | string | no | Optional delivery instruction from the customer. maxLength 1000. |
| `paymentMethod` | `CASH_ON_DELIVERY` | no | One option today. Present as an enum so a second method does not require a client change. Default `"CASH_ON_DELIVERY"`. |
| `createAccount` | boolean | no | Guest checkout only. Offers to turn this purchase into an account. The order is placed either way - see the endpoint description for the full flow. Requires `email`, and is ignored for a signed-in caller. Default `false`. |
| `email` | string | no | Where the receipt goes. **Required when `createAccount` is true**, since there would otherwise be nothing to verify. |
| `idempotencyKey` | string | no | Optional double-submit guard. Send the same key with a retried request and the original order comes back (200, `code: ORDER_ALREADY_PLACED`) instead of a second one. Worth using: a double-tapped "Place order" on a flaky mobile connection is the normal way duplicate cash-on-delivery orders get created, and the customer only finds out when two couriers arrive. Scoped server-side to the caller - the account if signed in, else the `email`, else the IP - so keys cannot collide between people and one shopper's key can never return another's order. The practical consequence for a client: **retry the identical body**. A retry that drops `email`, or arrives on a session the first attempt did not have, lands in a different scope and places a second order. minLength 8, maxLength 120. |

```json
{
  "items": [
    {
      "productId": "6712f0c2a1b4d3e5f6a7b8c9",
      "variantId": "6712f0c2a1b4d3e5f6a7b8d1",
      "quantity": 2
    },
    {
      "productId": "6712f0c2a1b4d3e5f6a7b8ca",
      "quantity": 1
    }
  ],
  "contact": {
    "name": "Rahim Uddin",
    "phone": "+8801712345678"
  },
  "shippingAddress": {
    "line1": "House 42, Road 3, Dhanmondi",
    "area": "Dhanmondi",
    "city": "Dhaka",
    "postalCode": "1209",
    "country": "Bangladesh"
  },
  "note": "Please call before delivery",
  "paymentMethod": "CASH_ON_DELIVERY",
  "createAccount": true,
  "email": "rahim@example.com",
  "idempotencyKey": "8f14e45f-ceea-467a-9c1e-1b2c3d4e5f60"
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | A retried `idempotencyKey` - the original order, not a second one. Carries `code` of `ORDER_ALREADY_PLACED`. |
| `201` | Order placed. |
| `422` | An item is unavailable, out of stock, missing a required variant, or a price field was sent. Each entry names the offending item's position and a `code`. |
| `429` | Rate limit for this tier exhausted. |

---

### `POST /orders/filter`

**Access:** Any signed-in user

The signed-in customer's own orders

Paginated, zero-based. There is **no `userId` field**, and that is not an oversight - the owner comes from the verified token, and accepting one would invite the belief that it does something.

A guest order appears here only once its email has been verified through the account-creation flow, which is what attaches it to an account.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `status` | `PENDING` \| `CONFIRMED` \| `OUT_FOR_DELIVERY` \| `DELIVERED` \| `RETURNED` \| `CANCELED` *(or array)* | no | One status or several. |
| `placedFrom` | string | no |  |
| `placedTo` | string | no |  |
| `sort` | object | no |  |
| `sort.field` | `placedAt` \| `total` \| `status` | no | Default `"placedAt"`. |
| `sort.direction` | `asc` \| `desc` | no | Default `"desc"`. |
| `pagination` | object | no |  |
| `pagination.page` | integer | no | Zero-based. Default `0`. min 0. |
| `pagination.limit` | integer | no | Default `20`. min 1, max 100. |

```json
{
  "status": [
    "PENDING",
    "CONFIRMED"
  ],
  "sort": {
    "field": "placedAt",
    "direction": "desc"
  },
  "pagination": {
    "page": 0,
    "limit": 20
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Paginated orders. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |

---

### `GET /orders/{id}`

**Access:** Any signed-in user

One of the customer's own orders

Scoped to the caller inside the query rather than fetched and then checked, so there is no window in which someone else's order exists in a variable.

Answers **404, not 403**, for an order belonging to someone else - "this order exists but is not yours" is itself information, and order ids are sequential.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | integer | **yes** |  e.g. `1000` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | The order. |
| `401` | Missing, invalid, expired or revoked access token. |
| `404` | Resource does not exist. |

---

## Orders Admin

Staff order queue: status workflow, corrections and removal

### `POST /admin/orders/filter`

**Access:** Moderator and above

The staff order queue

Every order in the system, paginated and zero-based. **MODERATOR and above** - moderators work this queue, and admins and owners inherit access rather than being listed separately.

Returns the full staff shape, including the IP and device the order came from, because the person working this list is deciding whether to dispatch and hiding half the record just means opening every order one at a time.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `status` | `PENDING` \| `CONFIRMED` \| `OUT_FOR_DELIVERY` \| `DELIVERED` \| `RETURNED` \| `CANCELED` *(or array)* | no | One status or several. |
| `paymentMethod` | `CASH_ON_DELIVERY` | no |  |
| `search` | string | no | One box, matching order number, customer name, phone or email - because that is what the person on the phone has: a number the customer read out, or their name. |
| `userId` | integer | no | Narrow to one customer. |
| `guestOnly` | boolean | no | Only orders with no account behind them - the ones fraud review looks at first. |
| `minTotal` | number | no |  |
| `maxTotal` | number | no |  |
| `placedFrom` | string | no |  |
| `placedTo` | string | no |  |
| `includeDeleted` | boolean | no | Soft-deleted orders are hidden unless explicitly asked for. Default `false`. |
| `sort` | object | no |  |
| `sort.field` | `placedAt` \| `total` \| `status` | no | Default `"placedAt"`. |
| `sort.direction` | `asc` \| `desc` | no | Default `"desc"`. |
| `pagination` | object | no |  |
| `pagination.page` | integer | no | Zero-based. Default `0`. min 0. |
| `pagination.limit` | integer | no | Default `20`. min 1, max 100. |

```json
{
  "status": [
    "PENDING",
    "CONFIRMED"
  ],
  "search": "482915",
  "guestOnly": false,
  "minTotal": 500,
  "includeDeleted": false,
  "sort": {
    "field": "placedAt",
    "direction": "desc"
  },
  "pagination": {
    "page": 0,
    "limit": 20
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Paginated orders, full staff shape. |
| `401` | Missing, invalid, expired or revoked access token. |
| `403` | Authenticated, but not allowed to perform this action. |
| `422` | Request failed schema validation. |

---

### `GET /admin/orders/{id}`

**Access:** Moderator and above

One order, full staff shape

MODERATOR and above. Soft-deleted orders are visible here.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | integer | **yes** |  e.g. `1000` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | The order. |
| `403` | Authenticated, but not allowed to perform this action. |
| `404` | Resource does not exist. |

---

### `PATCH /admin/orders/{id}`

**Access:** Moderator and above

Correct the delivery details

MODERATOR and above. Fixes a mistyped house number or a wrong phone - the routine correction, made daily.

**Nothing about money or state is reachable from here.** There is no way to edit a price, a line item, a quantity or a total through this API at all: a moderator able to change what an order costs after the customer agreed to it is a different system, and one that needs an approval trail before it exists. Status is its own endpoint.

Address fields **merge** rather than replace, so sending only `city` fixes the city without wiping the street.

Refused for a DELIVERED, RETURNED or CANCELED order: at that point the address is the record of where the goods actually went, and editing it rewrites the evidence rather than fixing anything.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | integer | **yes** |  e.g. `1000` |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `contact` | object | no |  |
| `contact.name` | string | no | maxLength 120. |
| `contact.phone` | string | no |  |
| `shippingAddress` | object | no | Partial - merged into the existing address. |
| `shippingAddress.line1` | string | no |  |
| `shippingAddress.line2` | string | no |  |
| `shippingAddress.area` | string | no |  |
| `shippingAddress.city` | string | no |  |
| `shippingAddress.district` | string | no |  |
| `shippingAddress.postalCode` | string | no |  |
| `shippingAddress.country` | string | no |  |
| `note` | string | no | The customer's delivery instruction. Send `null` to clear it; omit to leave it alone. maxLength 1000. Nullable. |

```json
{
  "contact": {
    "phone": "+8801799999999"
  },
  "shippingAddress": {
    "city": "Dhaka",
    "postalCode": "1209"
  },
  "note": "Leave with the security guard"
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Updated order. |
| `403` | Authenticated, but not allowed to perform this action. |
| `404` | Resource does not exist. |
| `422` | Nothing to update, or the order is finalised (`ORDER_FINALISED`). |

---

### `DELETE /admin/orders/{id}`

**Access:** Admin and above

Soft delete an order

**ADMIN and above** - one rung higher than the rest of this router. A moderator works the queue; removing the record of a sale is a different kind of act.

Hides the order from every listing without destroying it, because an order is a financial record - what a refund, a tax return and a dispute are all argued from. Any stock it was still holding is released on the way out, since units held for an order nobody can see are units permanently lost from sale.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | integer | **yes** |  e.g. `1000` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | The soft-deleted order. |
| `403` | Authenticated, but not allowed to perform this action. |
| `404` | Resource does not exist. |

---

### `PATCH /admin/orders/{id}/status`

**Access:** Moderator and above

Move an order through the workflow

MODERATOR and above. Three rules, all enforced server-side.

**1. The transition must be legal.** Any status being settable from any other is not a workflow, it is a corruption that surfaces weeks later in a report nobody can reconcile. The permitted moves are:

- `PENDING` → CONFIRMED, CANCELED
- `CONFIRMED` → OUT_FOR_DELIVERY, CANCELED
- `OUT_FOR_DELIVERY` → DELIVERED, RETURNED, CANCELED
- `DELIVERED` → RETURNED
- `RETURNED`, `CANCELED` → **terminal**

**2. A bad outcome needs a reason.** `note` is **required** for RETURNED and CANCELED, optional otherwise. Those are the two statuses anyone ever looks back at - during a refund dispute, a courier claim, or an argument about who cancelled - and the bare word answers none of those questions. The note is recorded against that specific change in `statusHistory`, alongside who made it and when.

**3. Ending an order releases its stock**, exactly once. Reaching RETURNED or CANCELED returns the reserved units to the catalog; `stockReleased` guards against a retry restocking twice and inventing inventory that never existed.

Reaching DELIVERED also marks the payment PAID, since cash on delivery is settled by the courier handing it over.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | integer | **yes** |  e.g. `1000` |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `status` | `PENDING` \| `CONFIRMED` \| `OUT_FOR_DELIVERY` \| `DELIVERED` \| `RETURNED` \| `CANCELED` | **yes** |  |
| `note` | string | no | Required for RETURNED and CANCELED; optional for every other status. maxLength 1000. |

```json
{
  "status": "CONFIRMED"
}
```

*Cancel - note required*

```json
{
  "status": "CANCELED",
  "note": "Customer unreachable on three attempts"
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Updated order. |
| `403` | Authenticated, but not allowed to perform this action. |
| `404` | Resource does not exist. |
| `422` | Illegal transition (`ORDER_STATUS_TRANSITION_INVALID`), a missing note on a negative status (`ORDER_STATUS_NOTE_REQUIRED`), or the order is already in that status (`ORDER_STATUS_UNCHANGED`). |

---

### `DELETE /admin/orders/{id}/permanent`

**Access:** Admin and above

Permanently delete an order

**ADMIN and above, and genuinely irreversible.** Its own path rather than a flag on the soft delete, because a destructive operation should be something you ask for by name, not something a stray query parameter turns on.

Any stock still held is released first, since afterwards there is no record left to release it from.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | integer | **yes** |  e.g. `1000` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Deleted. |
| `403` | Authenticated, but not allowed to perform this action. |
| `404` | Resource does not exist. |

---

## Categories

Hierarchical catalog taxonomy and attribute configuration

### `POST /categories`

**Access:** Any signed-in user

Create a hierarchical category

Admin and above. The attributes array accepts only active Attribute Library ids; the backend validates every reference before saving.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | **yes** |  |
| `slug` | string | **yes** |  |
| `description` | string | no |  |
| `parentId` | object | no |  |
| `status` | `DRAFT` \| `ACTIVE` \| `INACTIVE` \| `ARCHIVED` | no |  |
| `visibility` | `PUBLIC` \| `PRIVATE` \| `HIDDEN` | no |  |
| `image` | string | no | maxLength 1024. |
| `attributes` | string[] | no | Attribute Library ids. Every id must reference an active, non-deleted attribute. |
| `seo` | object | no |  |
| `seo.title` | string | no |  |
| `seo.description` | string | no |  |
| `seo.keywords` | string[] | no |  |
| `seo.canonicalUrl` | string | no |  |
| `seo.noIndex` | boolean | no |  |
| `seo.noFollow` | boolean | no |  |
| `seo.ogTitle` | string | no |  |
| `seo.ogDescription` | string | no |  |
| `seo.ogImage` | string | no |  |
| `seo.twitterTitle` | string | no |  |
| `seo.twitterDescription` | string | no |  |
| `seo.twitterImage` | string | no |  |
| `sortOrder` | integer | no | min 0. |
| `showInHome` | boolean | no | Offers this category for the home page. Curation only - it says "eligible", not "shown": `POST /shop/categories` still hides an eligible category that has nothing to sell. Also settable in bulk through `PATCH /categories/show-in-home`. Default `false`. |

```json
{
  "name": "T-Shirts",
  "slug": "t-shirts",
  "description": "Performance, casual and everyday t-shirts.",
  "parentId": "66bca1f8d7432e0012345677",
  "status": "ACTIVE",
  "visibility": "PUBLIC",
  "image": "https://cdn.example.com/categories/t-shirts.webp",
  "attributes": [
    "66bca1f8d7432e0012345683",
    "66bca1f8d7432e0012345680",
    "66bca1f8d7432e0012345684"
  ],
  "seo": {
    "title": "Buy T-Shirts Online | GadgetSimp",
    "description": "Shop performance and casual t-shirts online.",
    "keywords": [
      "t-shirts",
      "mens t-shirts"
    ],
    "canonicalUrl": "https://gadgetsimp.dev/categories/t-shirts",
    "noIndex": false,
    "noFollow": false,
    "ogTitle": "T-Shirts",
    "ogDescription": "Explore our t-shirt collection.",
    "ogImage": "https://cdn.example.com/categories/t-shirts-og.webp",
    "twitterTitle": "T-Shirts",
    "twitterDescription": "Explore our t-shirt collection.",
    "twitterImage": "https://cdn.example.com/categories/t-shirts-twitter.webp"
  },
  "sortOrder": 20,
  "showInHome": true
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `201` | Category created. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |

---

### `PATCH /categories/show-in-home`

**Access:** Any signed-in user

Set the home-page flag on several categories

Bulk toggle for `showInHome`, requiring `ROLE_ADMIN` or above.

Takes a list because the screen using it is a multi-select on a category table. It is applied as a single `updateMany`, so the selection cannot end up half-flagged.

`showInHome` is the state you want, not a flip - so retrying after a dropped response cannot silently invert what you just set. Unknown ids are reported rather than ignored.

The flag is curation only: `POST /shop/categories` still hides a flagged category that has nothing to sell.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `ids` | string[] | **yes** | minItems 1, maxItems 200. |
| `showInHome` | boolean | **yes** |  |

```json
{
  "ids": [
    "6712f0c2a1b4d3e5f6a7b8c9",
    "6712f0c2a1b4d3e5f6a7b8ca"
  ],
  "showInHome": true
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Updated categories. |
| `401` | Missing, invalid, expired or revoked access token. |
| `403` | Authenticated, but not allowed to perform this action. |
| `422` | Validation failed, or one of the ids does not exist. |

---

### `POST /categories/filter`

**Access:** Public

Filter public categories

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `parentId` | object | no |  |
| `search` | string | no | maxLength 120. |
| `pagination` | object | no |  |
| `pagination.page` | integer | no | Default `0`. min 0. |
| `pagination.limit` | integer | no | Default `20`. min 1, max 100. |

```json
{
  "parentId": "66bca1f8d7432e0012345677",
  "search": "shirts",
  "pagination": {
    "page": 0,
    "limit": 20
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Paginated public categories returned. |

---

### `POST /categories/filter-groupped`

**Access:** Public

Filter categories as a grouped hierarchy

Returns nested children arrays ordered by sortOrder, name and id. Search retains matching categories and their ancestors.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `parentId` | object | no |  |
| `search` | string | no | maxLength 120. |

```json
{
  "parentId": null,
  "search": "shirts"
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Nested category tree returned. |

---

### `PUT /categories/sort`

**Access:** Any signed-in user

Reorder or move categories

Admin and above. Only parentId and sortOrder are changed; all other category data remains untouched. Omit parentId to keep the current parent, or send null to move a category to the root.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `categories` | object[] | **yes** | minItems 1, maxItems 500. |
| `categories[].id` | string | **yes** |  |
| `categories[].parentId` | object | no |  |
| `categories[].sortOrder` | integer | **yes** | min 0. |

```json
{
  "categories": [
    {
      "id": "66bca1f8d7432e0012345678",
      "parentId": "66bca1f8d7432e0012345676",
      "sortOrder": 0
    },
    {
      "id": "66bca1f8d7432e0012345685",
      "parentId": "66bca1f8d7432e0012345676",
      "sortOrder": 1
    },
    {
      "id": "66bca1f8d7432e0012345686",
      "parentId": null,
      "sortOrder": 2
    }
  ]
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Category positions updated; response contains only structural fields. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |

---

### `GET /categories/{id}/configuration`

**Access:** Public

Get resolved category attribute configuration

Returns category flags together with resolved Attribute Library metadata for data-driven product forms.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  e.g. `66bca1f8d7432e0012345678` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Category configuration retrieved. |
| `404` | Resource does not exist. |

---

### `GET /categories/{id}`

**Access:** Public

Get a public category

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  e.g. `66bca1f8d7432e0012345678` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Category retrieved. |
| `404` | Resource does not exist. |

---

### `PUT /categories/{id}`

**Access:** Any signed-in user

Replace a category

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  e.g. `66bca1f8d7432e0012345678` |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | **yes** |  |
| `slug` | string | **yes** |  |
| `description` | string | no |  |
| `parentId` | object | no |  |
| `status` | `DRAFT` \| `ACTIVE` \| `INACTIVE` \| `ARCHIVED` | no |  |
| `visibility` | `PUBLIC` \| `PRIVATE` \| `HIDDEN` | no |  |
| `image` | string | no | maxLength 1024. |
| `attributes` | string[] | no | Attribute Library ids. Every id must reference an active, non-deleted attribute. |
| `seo` | object | no |  |
| `seo.title` | string | no |  |
| `seo.description` | string | no |  |
| `seo.keywords` | string[] | no |  |
| `seo.canonicalUrl` | string | no |  |
| `seo.noIndex` | boolean | no |  |
| `seo.noFollow` | boolean | no |  |
| `seo.ogTitle` | string | no |  |
| `seo.ogDescription` | string | no |  |
| `seo.ogImage` | string | no |  |
| `seo.twitterTitle` | string | no |  |
| `seo.twitterDescription` | string | no |  |
| `seo.twitterImage` | string | no |  |
| `sortOrder` | integer | no | min 0. |
| `showInHome` | boolean | no | Offers this category for the home page. Curation only - it says "eligible", not "shown": `POST /shop/categories` still hides an eligible category that has nothing to sell. Also settable in bulk through `PATCH /categories/show-in-home`. Default `false`. |

```json
{
  "name": "Men's T-Shirts",
  "slug": "mens-t-shirts",
  "description": "Updated performance and casual t-shirt category.",
  "parentId": "66bca1f8d7432e0012345677",
  "status": "ACTIVE",
  "visibility": "PUBLIC",
  "image": "https://cdn.example.com/categories/mens-t-shirts.webp",
  "attributes": [
    "66bca1f8d7432e0012345683",
    "66bca1f8d7432e0012345680"
  ],
  "seo": {
    "title": "Buy Men's T-Shirts Online",
    "description": "Shop men's t-shirts online.",
    "keywords": [
      "mens t-shirts"
    ],
    "canonicalUrl": "https://gadgetsimp.dev/categories/mens-t-shirts",
    "noIndex": false,
    "noFollow": false
  },
  "sortOrder": 20,
  "showInHome": true
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Category replaced. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |

---

### `DELETE /categories/{id}`

**Access:** Any signed-in user

Archive a category

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  e.g. `66bca1f8d7432e0012345678` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Category archived. |
| `409` | Category still has active children. |

---

## Brands

Global product brands

### `POST /brands`

**Access:** Any signed-in user

Create a global brand

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | **yes** |  |
| `slug` | string | **yes** |  |
| `description` | string | no |  |
| `logo` | string | no | maxLength 1024. |
| `website` | string | no |  |
| `status` | `DRAFT` \| `ACTIVE` \| `INACTIVE` \| `ARCHIVED` | no |  |
| `visibility` | `PUBLIC` \| `PRIVATE` \| `HIDDEN` | no |  |
| `seo` | object | no |  |
| `seo.title` | string | no |  |
| `seo.description` | string | no |  |
| `seo.keywords` | string[] | no |  |
| `seo.canonicalUrl` | string | no |  |
| `seo.noIndex` | boolean | no |  |
| `seo.noFollow` | boolean | no |  |
| `seo.ogTitle` | string | no |  |
| `seo.ogDescription` | string | no |  |
| `seo.ogImage` | string | no |  |
| `seo.twitterTitle` | string | no |  |
| `seo.twitterDescription` | string | no |  |
| `seo.twitterImage` | string | no |  |
| `publishedAt` | string | no | Nullable. |

```json
{
  "name": "Nike",
  "slug": "nike",
  "description": "Global sportswear and footwear brand.",
  "logo": "https://cdn.example.com/brands/nike.webp",
  "website": "https://www.nike.com",
  "status": "ACTIVE",
  "visibility": "PUBLIC",
  "seo": {
    "title": "Nike Products | GadgetSimp",
    "description": "Shop Nike products online.",
    "keywords": [
      "nike",
      "nike products"
    ],
    "canonicalUrl": "https://gadgetsimp.dev/brands/nike",
    "noIndex": false,
    "noFollow": false,
    "ogTitle": "Nike Products",
    "ogDescription": "Explore Nike products.",
    "ogImage": "https://cdn.example.com/brands/nike-og.webp",
    "twitterTitle": "Nike Products",
    "twitterDescription": "Explore Nike products.",
    "twitterImage": "https://cdn.example.com/brands/nike-twitter.webp"
  },
  "publishedAt": "2026-08-13T09:00:00.000Z"
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `201` | Brand created. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |

---

### `POST /brands/filter`

**Access:** Public

Filter public brands

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `search` | string | no | maxLength 120. |
| `pagination` | object | no |  |
| `pagination.page` | integer | no | Default `0`. min 0. |
| `pagination.limit` | integer | no | Default `20`. min 1, max 100. |

```json
{
  "search": "nike",
  "pagination": {
    "page": 0,
    "limit": 20
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Paginated public brands returned. |

---

### `GET /brands/{id}`

**Access:** Public

Get a public brand

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  e.g. `66bca1f8d7432e0012345679` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Brand retrieved. |
| `404` | Resource does not exist. |

---

### `PUT /brands/{id}`

**Access:** Any signed-in user

Replace a brand

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  e.g. `66bca1f8d7432e0012345679` |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | **yes** |  |
| `slug` | string | **yes** |  |
| `description` | string | no |  |
| `logo` | string | no | maxLength 1024. |
| `website` | string | no |  |
| `status` | `DRAFT` \| `ACTIVE` \| `INACTIVE` \| `ARCHIVED` | no |  |
| `visibility` | `PUBLIC` \| `PRIVATE` \| `HIDDEN` | no |  |
| `seo` | object | no |  |
| `seo.title` | string | no |  |
| `seo.description` | string | no |  |
| `seo.keywords` | string[] | no |  |
| `seo.canonicalUrl` | string | no |  |
| `seo.noIndex` | boolean | no |  |
| `seo.noFollow` | boolean | no |  |
| `seo.ogTitle` | string | no |  |
| `seo.ogDescription` | string | no |  |
| `seo.ogImage` | string | no |  |
| `seo.twitterTitle` | string | no |  |
| `seo.twitterDescription` | string | no |  |
| `seo.twitterImage` | string | no |  |
| `publishedAt` | string | no | Nullable. |

```json
{
  "name": "Nike",
  "slug": "nike",
  "description": "Updated global sportswear brand description.",
  "logo": "https://cdn.example.com/brands/nike.webp",
  "website": "https://www.nike.com",
  "status": "ACTIVE",
  "visibility": "PUBLIC",
  "seo": {
    "title": "Nike Products | GadgetSimp",
    "description": "Shop the latest Nike products online.",
    "keywords": [
      "nike",
      "sportswear"
    ],
    "canonicalUrl": "https://gadgetsimp.dev/brands/nike",
    "noIndex": false,
    "noFollow": false
  },
  "publishedAt": "2026-08-13T09:00:00.000Z"
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Brand replaced. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |

---

### `DELETE /brands/{id}`

**Access:** Any signed-in user

Archive a brand

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  e.g. `66bca1f8d7432e0012345679` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Brand archived. |
| `401` | Missing, invalid, expired or revoked access token. |

---

## Attributes

Reusable metadata-driven catalog attributes

### `POST /attributes`

**Access:** Any signed-in user

Create an Attribute Library entry

Admin and above. Attribute names and keys are database-driven, not application enums.

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | **yes** |  |
| `key` | string | **yes** |  |
| `slug` | string | **yes** |  |
| `description` | string | no |  |
| `source` | `product` \| `variant` \| `entity` | **yes** |  |
| `type` | `checkbox` \| `radio` \| `select` \| `color` \| `range` | **yes** |  |
| `status` | `DRAFT` \| `ACTIVE` \| `INACTIVE` \| `ARCHIVED` | no |  |
| `min` | number | no | Required only when type is range. |
| `max` | number | no | Required only when type is range and must be greater than or equal to min. |
| `display` | object | no |  |
| `display.helpText` | string | no |  |
| `display.placeholder` | string | no |  |
| `display.showInProductDetails` | boolean | no |  |

```json
{
  "name": "Price Range",
  "key": "price_range",
  "slug": "price-range",
  "description": "Customer-facing product price range.",
  "source": "product",
  "type": "range",
  "status": "ACTIVE",
  "min": 0,
  "max": 100000,
  "display": {
    "helpText": "Enter a price within the supported range.",
    "placeholder": "Enter price",
    "showInProductDetails": true
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `201` | Attribute created. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |

---

### `POST /attributes/filter`

**Access:** Any signed-in user

Filter and paginate the Attribute Library

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `search` | string | no | maxLength 120. |
| `source` | `product` \| `variant` \| `entity` | no |  |
| `type` | `checkbox` \| `radio` \| `select` \| `color` \| `range` | no |  |
| `status` | `DRAFT` \| `ACTIVE` \| `INACTIVE` \| `ARCHIVED` | no |  |
| `page` | integer | no | Default `0`. min 0. |
| `limit` | integer | no | Default `20`. min 1, max 100. |

```json
{
  "search": "color",
  "source": "variant",
  "type": "color",
  "status": "ACTIVE",
  "page": 0,
  "limit": 20
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Paginated attributes returned. |
| `401` | Missing, invalid, expired or revoked access token. |

---

### `GET /attributes/{id}`

**Access:** Any signed-in user

Get an Attribute Library entry

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  e.g. `66bca1f8d7432e0012345680` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Attribute retrieved. |
| `404` | Resource does not exist. |

---

### `PUT /attributes/{id}`

**Access:** Any signed-in user

Replace an Attribute Library entry

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  e.g. `66bca1f8d7432e0012345680` |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | **yes** |  |
| `key` | string | **yes** |  |
| `slug` | string | **yes** |  |
| `description` | string | no |  |
| `source` | `product` \| `variant` \| `entity` | **yes** |  |
| `type` | `checkbox` \| `radio` \| `select` \| `color` \| `range` | **yes** |  |
| `status` | `DRAFT` \| `ACTIVE` \| `INACTIVE` \| `ARCHIVED` | no |  |
| `min` | number | no | Required only when type is range. |
| `max` | number | no | Required only when type is range and must be greater than or equal to min. |
| `display` | object | no |  |
| `display.helpText` | string | no |  |
| `display.placeholder` | string | no |  |
| `display.showInProductDetails` | boolean | no |  |

```json
{
  "name": "Product Price Range",
  "key": "price_range",
  "slug": "price-range",
  "description": "Updated customer-facing product price range.",
  "source": "product",
  "type": "range",
  "status": "ACTIVE",
  "min": 0,
  "max": 150000,
  "display": {
    "helpText": "Enter a supported price.",
    "placeholder": "Enter price",
    "showInProductDetails": true
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Attribute replaced. |
| `401` | Missing, invalid, expired or revoked access token. |
| `422` | Request failed schema validation. |

---

### `DELETE /attributes/{id}`

**Access:** Any signed-in user

Archive an attribute

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  e.g. `66bca1f8d7432e0012345680` |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Attribute archived. |
| `401` | Missing, invalid, expired or revoked access token. |

---

## Variations

Generated purchasable SKUs, pricing and stock

### `POST /variations/generate`

**Access:** Any signed-in user

Preview variation combinations without saving them

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `options` | object | **yes** |  |
| `sellingPrice` | number | no | min 0. |
| `originalPrice` | number | no | min 0. |
| `stock` | object | no |  |
| `stock.quantity` | integer | no | min 0. |
| `stock.trackInventory` | boolean | no |  |
| `stock.allowBackorder` | boolean | no |  |
| `stock.lowStockThreshold` | integer | no | min 0. |
| `stock.status` | `IN_STOCK` \| `OUT_OF_STOCK` \| `BACKORDER` | no |  |
| `status` | `DRAFT` \| `ACTIVE` \| `OUT_OF_STOCK` | no |  |
| `image` | object | no |  |
| `image.alt` | string | **yes** |  |
| `image.src` | string | **yes** |  |
| `image.id` | integer | no | Optional media id; omitted when no media record is linked. min 1. |

```json
{
  "options": {
    "color": [
      "black",
      "white"
    ],
    "size": [
      "m",
      "l"
    ]
  },
  "sellingPrice": 1299,
  "originalPrice": 1499,
  "stock": {
    "quantity": 8,
    "trackInventory": true,
    "allowBackorder": false,
    "lowStockThreshold": 2,
    "status": "IN_STOCK"
  },
  "status": "ACTIVE",
  "image": {
    "alt": "Nike sports t-shirt",
    "src": "https://cdn.example.com/products/nike-shirt.webp",
    "id": 1050
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Generated combinations with supplied prices |
| `422` | Request failed schema validation. |

---

### `POST /variations/filter`

**Access:** Any signed-in user

Filter and paginate variations

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `productId` | string | no |  |
| `search` | string | no |  |
| `status` | `DRAFT` \| `ACTIVE` \| `OUT_OF_STOCK` | no |  |
| `pagination` | object | no |  |
| `pagination.page` | integer | no | min 0. |
| `pagination.limit` | integer | no | min 1, max 100. |

```json
{
  "productId": "66bca1f8d7432e0012345681",
  "search": "NIKE",
  "status": "ACTIVE",
  "pagination": {
    "page": 0,
    "limit": 50
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Variations returned with a minimal productId object. |

---

### `GET /variations/{id}`

**Access:** Any signed-in user

Get a variation

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Variation retrieved. |

---

### `PATCH /variations/{id}`

**Access:** Any signed-in user

Partially update price, stock, image or other variation data

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `sku` | string | no |  |
| `barcode` | string | no |  |
| `sellingPrice` | number | no | min 0. |
| `originalPrice` | number | no | min 0. |
| `stock` | object | no |  |
| `stock.quantity` | integer | no | min 0. |
| `stock.trackInventory` | boolean | no |  |
| `stock.allowBackorder` | boolean | no |  |
| `stock.lowStockThreshold` | integer | no | min 0. |
| `stock.status` | `IN_STOCK` \| `OUT_OF_STOCK` \| `BACKORDER` | no |  |
| `status` | `DRAFT` \| `ACTIVE` \| `OUT_OF_STOCK` | no |  |
| `image` | object | no |  |
| `image.alt` | string | **yes** |  |
| `image.src` | string | **yes** |  |
| `image.id` | integer | no | Optional media id; omitted when no media record is linked. min 1. |
| `sortOrder` | integer | no | min 0. |

```json
{
  "sellingPrice": 1299,
  "originalPrice": 1499,
  "stock": {
    "quantity": 8,
    "trackInventory": true,
    "allowBackorder": false,
    "lowStockThreshold": 2,
    "status": "IN_STOCK"
  },
  "status": "ACTIVE",
  "image": {
    "alt": "Black medium t-shirt",
    "src": "https://cdn.example.com/products/nike-shirt-black-m.webp",
    "id": 1050
  }
}
```

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Supplied fields updated; omitted fields preserved. |

---

### `DELETE /variations/{id}`

**Access:** Any signed-in user

Delete a variation

Soft-deletes the variation so it no longer appears in product or variation queries.

**Parameters**

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `id` | path | string | **yes** |  |

**Responses**

| Status | Meaning |
| --- | --- |
| `200` | Variation deleted. |
| `404` | Variation not found. |

---
