"use strict";

/**
 * The hand-written half of FRONTEND-INSTRUCTIONS.md.
 *
 * The endpoint reference below it is generated from the OpenAPI spec and can
 * be regenerated at will; this part is the reasoning and the working patterns,
 * which no spec can express. Keep it here rather than in the .md itself so a
 * regeneration never wipes it.
 */

const GUIDE = ({ total, paths, version }) => `# GadgetSimp — Frontend Instructions

**API version ${version} · ${total} operations across ${paths} paths**

Everything the storefront and admin panel can call, with the exact body each
endpoint accepts and the patterns to implement them with.

> **The endpoint reference in this file is generated from the server's OpenAPI
> spec** (\`npm run docs:frontend\`). It cannot drift from the running code. If
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

- **Base URL:** every path in this document is relative to \`/api/v1\`.
  Locally that is \`http://localhost:4000/api/v1\`.
- **Content type:** \`application/json\` everywhere except the media upload,
  which is \`multipart/form-data\`.
- **Interactive docs:** \`/api/v1/docs\` (Swagger UI) and \`/api/v1/docs.json\`
  (raw spec, if you want to generate a typed client).

Set \`APP_URL\` on the server to your frontend origin — the verification and
password-reset emails link back to it, at \`/verify-email?token=…\` and
\`/reset-password?token=…\`. Those two routes need to exist on your side.

---

## The response envelope

Every response — success or failure — has the same shape, so you write one
parser for the whole API.

\`\`\`ts
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
\`\`\`

\`statusCode\` is in the body deliberately: it survives a logged payload, a
webhook relay, or an HTTP wrapper that only hands back parsed JSON.

**Read \`data\`, not the root.** A list endpoint returns
\`data.products\` / \`data.orders\` / \`data.items\` and puts the page counters in
\`meta\`.

---

## Errors, and how to show them

\`\`\`ts
type ApiFieldError = {
  field: string;    // "items.1.variantId", "body.email", "note"
  code?: string;    // "INSUFFICIENT_STOCK", "VARIANT_REQUIRED"
  message: string;  // safe to show as-is
};
\`\`\`

\`field\` points at the exact input **including array positions**, so it maps
straight onto a form control:

\`\`\`json
{
  "success": false,
  "statusCode": 422,
  "message": "Your order could not be placed",
  "code": "ORDER_ITEMS_INVALID",
  "errors": [
    { "field": "items.1.quantity", "code": "INSUFFICIENT_STOCK", "message": "Only 3 of Nike Sports T-Shirt remain." }
  ]
}
\`\`\`

Show \`message\` at the top and attach each \`errors[].message\` to its field.
Branch logic on \`code\`, never on \`message\` — the wording will change.

**Every request schema is strict.** An unrecognised key is a **422**, not a
silently ignored field. That is deliberate: it means a typo fails loudly
instead of doing nothing. If you get \`Unrecognized keys: "x"\`, remove the key.

---

## Authentication

| Token | Lifetime | Where it lives |
| --- | --- | --- |
| Access | 15 minutes | \`Authorization: Bearer <token>\` header |
| Refresh | 7 days, rotated on every use | httpOnly cookie \`gs_refresh_token\` |

The refresh token is httpOnly so JavaScript cannot read it — which is what
stops XSS from stealing a session. **You must send credentials** on refresh:

\`\`\`ts
fetch(\`\${BASE}/auth/refresh\`, { method: "POST", credentials: "include" });
\`\`\`

CORS is an allow-list, so add your frontend origin to \`CORS_ORIGINS\` on the
server or the cookie will not be sent.

**Rotation is theft detection.** Each refresh invalidates the token used. If a
token that was already rotated is presented again, the server assumes it was
stolen and drops *every* session for that user (\`REFRESH_TOKEN_REUSED\`). So:
never fire two refreshes concurrently — de-duplicate them (see the client
below) or a race will sign your user out.

The access token payload carries \`sub\`, \`email\`, \`fullName\`,
\`phone\` and \`role\`, so you can render a header without an extra call. Do not
trust it for authorisation decisions that matter — the server re-checks the
user on every request.

### Roles

\`ROLE_CUSTOMER\` → \`ROLE_MODERATOR\` → \`ROLE_ADMIN\` → \`ROLE_OWNER\`, ranked.
Permissions accumulate upward: anything a moderator can do, an admin and owner
can too. The **Access** line on each endpoint states the minimum.

---

## An API client to build on

This handles the three things every call needs: the envelope, the bearer
token, and a single-flight refresh on 401.

\`\`\`ts
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
      const response = await fetch(\`\${BASE}/auth/refresh\`, {
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
      ...(accessToken ? { Authorization: \`Bearer \${accessToken}\` } : {}),
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
\`\`\`

---

## Pagination

**Pages are zero-based. The first page is \`page: 0\`.** This matches MUI
DataGrid and TanStack Table, so pass the table's page straight through.

\`\`\`json
{ "pagination": { "page": 0, "limit": 20 } }
\`\`\`

Every listing returns:

\`\`\`ts
type PaginationMeta = {
  page: number;        // zero-based
  limit: number;
  total: number;       // matching rows, not rows on this page
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};
\`\`\`

**Filter endpoints are \`POST\` with the filter in the body**, not GET with a
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
| Home page category tiles | \`POST /shop/categories\` with \`{ showInHome: true }\` |
| Product grid / search / filters | \`POST /shop\` |
| Filter sidebar for a category | \`GET /shop/filter-options/{categorySlug}\` |
| Product page | \`GET /shop/{slug}\` |

Everything is addressed by **slug**, not id — the shopper's URL is
\`/shop/laptops\`, so the API speaks the same language and no lookup is needed
to render a page.

\`\`\`json
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
\`\`\`

- \`categorySlugs\` is a **list**, and each slug expands to its whole subtree —
  \`electronics\` also returns products filed under its children.
- \`filters\` is category-driven. The keys come from
  \`GET /shop/filter-options/{categorySlug}\`; **do not hardcode them**. Sending
  \`filters\` without \`categorySlugs\` is a 422, because attribute keys are
  resolved from the category configuration.
- \`POST /shop\` returns the **lightweight card shape** — no descriptions, no
  attribute maps, no galleries. Fetch \`GET /shop/{slug}\` for the full record.

### Product attributes are grouped

A product's spec table is an **ordered array of titled groups**, and the order
is the display order:

\`\`\`json
"attributes": [
  { "title": "General Info", "options": { "material": "cotton", "fit": "regular" } },
  { "title": "Care",         "options": { "wash": "cold" } }
]
\`\`\`

Render each group as a block with its \`title\` as the heading. Filtering is
unaffected by grouping — you filter on the bare key (\`material\`), and the
server searches every group.

---

## Cart

Signed-in only. Every endpoint returns **the whole cart**, never a delta, so
assign the response to state rather than merging:

\`\`\`ts
const { data } = await api<{ cart: Cart; adjustments: Adjustment[] }>("/cart");
setCart(data.cart);
\`\`\`

| Action | Call |
| --- | --- |
| Load | \`GET /cart\` |
| Header badge | \`GET /cart/count\` |
| Add (batch) | \`POST /cart/items\` |
| Change quantities (batch) | \`PATCH /cart/items\` |
| Remove (batch) | \`DELETE /cart/items\` |
| Empty | \`DELETE /cart\` |

**Variants.** A cart line is a product *plus a variant*. A \`VARIABLE\` product
**requires** \`variantId\`; a \`SIMPLE\` one **refuses** it. Two variants of one
product are two separate lines.

**Address lines by \`id\`.** \`PATCH\` and \`DELETE\` take the cart line's \`id\`
(from \`cart.items[].id\`), not the product id — one product can occupy several
lines through different variants.

**\`quantity: 0\` removes a line.** The stepper on a cart row decrements to zero;
you do not need to switch endpoints.

**Handle \`adjustments\`.** Quantity is the one thing the server changes rather
than rejecting — it caps to available stock. Show it, or the shopper silently
gets fewer than they asked for:

\`\`\`ts
if (data.adjustments.length) {
  toast(data.adjustments.map((a) => a.message).join(" "));
}
\`\`\`

**Handle \`issues\` per line.** A cart whose product was withdrawn overnight
still loads — the row comes back with \`availability.purchasable: false\` and an
\`issues\` array explaining why (\`PRODUCT_UNAVAILABLE\`, \`OUT_OF_STOCK\`,
\`INSUFFICIENT_STOCK\`, \`PRICE_CHANGED\`). Render those rows greyed with a remove
button; never hide them, or the shopper can never clear them.

**Gate checkout on \`summary.checkoutReady\`.** It already folds in every issue.
Note that \`summary.subtotal\` counts **purchasable lines only**, while
\`summary.totalQuantity\` counts every line (it is the header badge).

**\`availability.maxQuantity: null\` means no ceiling**, not zero — use it to
bound a quantity stepper.

---

## Wishlist

Signed-in only. Products only — **no variants**. A wishlist records "I want
this thing"; the size is chosen at the point of buying.

| Action | Call |
| --- | --- |
| Fill in heart icons on a grid | \`GET /wishlist/ids\` |
| The wishlist page | \`POST /wishlist/filter\` |
| Save (batch) | \`POST /wishlist/items\` |
| Remove (batch) | \`DELETE /wishlist/items\` |
| Heart icon | \`POST /wishlist/toggle\` |
| Clear | \`DELETE /wishlist\` |

**Use \`GET /wishlist/ids\` for hearts.** Call it once on load, keep the ids in a
\`Set\`, and render every heart from that. Asking the paginated listing would
ship a hundred product cards to render a hundred booleans.

**Use \`POST /wishlist/toggle\` for the button**, not add/remove. The caller does
not say which direction — the server decides from current state, which makes a
double tap self-correcting even when your cached id list is stale. It answers
\`{ productId, inWishlist, total }\`, so set the icon from the response.

Saving is **idempotent** — re-saving something already there is fine and comes
back under \`alreadySaved\`. Removing an id that is not there is fine too.

**Out-of-stock products can be saved** (unlike the cart, which refuses them) —
that is half the point of a wishlist. Only *withdrawn* products are refused,
and existing entries for them stay listed with \`available: false\` so they can
still be removed.

---

## Checkout and orders

\`POST /orders\` works **signed in or as a guest**. Send a token if you have
one and the order links to that account.

### Prices are server-side. All of them.

No endpoint accepts a price, subtotal, total, discount or shipping fee. You
send products and quantities; the server resolves every figure from the catalog
and freezes it onto the order. Sending \`total\` is a **422**, not an ignored
field.

Render money from what the API returns. Never compute a total client-side and
send it.

\`\`\`json
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
\`\`\`

- \`contact.name\`, \`contact.phone\`, \`shippingAddress.line1\` and
  \`shippingAddress.city\` are **required**. A cash-on-delivery order that
  cannot be phoned cannot be delivered.
- \`note\` is optional.
- \`paymentMethod\` has one value today, \`CASH_ON_DELIVERY\`.
- The order is **all or nothing**: if any line is unavailable or short on
  stock, nothing is placed and the 422 names each offending position.

### Always send an \`idempotencyKey\`

Generate a UUID when the checkout form mounts and send the same one on every
retry. A double-tapped "Place order" on a flaky mobile connection is the normal
way duplicate cash-on-delivery orders get created, and the customer finds out
when two couriers arrive.

On a retry the original order comes back with **200** and
\`code: "ORDER_ALREADY_PLACED"\` instead of a second order being created.

> **Retry the identical body.** The key is scoped server-side to the caller
> (account → else \`email\` → else IP). A retry that drops \`email\`, or arrives on
> a session the first attempt did not have, lands in a different scope and
> places a second order.

### After placing

\`\`\`ts
const { data, code } = await api<{ order: Order; accountInvite: AccountInvite | null }>(
  "/orders",
  { method: "POST", body: checkout },
);

if (code === "ORDER_ALREADY_PLACED") { /* already had one - go to the same confirmation */ }
router.push(\`/orders/\${data.order.orderNumber}\`);
\`\`\`

Show the customer \`order.orderNumber\` — the six-digit number they quote on the
phone. \`order.id\` is the internal integer used by the API paths.

### A customer's own orders

\`POST /orders/filter\` and \`GET /orders/{id}\`. There is **no \`userId\` field** —
the owner comes from the token. Someone else's order answers **404, not 403**,
because order ids are sequential and "exists but is not yours" is itself
information.

---

## Guest checkout that creates an account

Send \`createAccount: true\` and an \`email\` on \`POST /orders\`. The order is
placed either way; the account is a follow-up. Three calls:

**1. Place the order.** The response carries \`accountInvite\`:

| \`accountInvite.status\` | What to show |
| --- | --- |
| \`VERIFICATION_SENT\` | "Check your inbox to finish setting up your account." |
| \`ACCOUNT_EXISTS\` | "You already have an account — sign in." |
| \`INVITATION_FAILED\` | Nothing about the order; it succeeded. Optionally offer to retry signup. |

**2. They click the emailed link** → your \`/verify-email?token=…\` page posts
the token to \`POST /auth/verify-email\`.

This answers **200** with **\`code: "REQUIRED_PASSWORD"\`** and a
\`registrationToken\` — and **no session**. A link that arrived by email proves
only mailbox access, so it is not treated as a login.

\`\`\`ts
const { data, code } = await api("/auth/verify-email", { method: "POST", body: { token } });

if (code === "REQUIRED_PASSWORD") {
  openPasswordModal(data.registrationToken);   // data also has email, fullName
} else {
  setAccessToken(data.accessToken);            // normal signup: already an account
}
\`\`\`

**Branch on \`code\`, not the status** — that is the field that separates the two
outcomes.

**3. The password modal** posts to \`POST /auth/complete-registration\` with
\`{ token: registrationToken, password }\`. The account is created, they are
signed in, and **their guest orders attach to the new account**. No second
verification email.

The \`registrationToken\` is valid for 30 minutes. The token from the email
itself will *not* work at step 3 — the address has to be verified first, and
step 2 rotates it.

---

## Admin: orders

Two separate surfaces, deliberately: \`/orders\` is the customer's own, and
\`/admin/orders\` reaches every order in the system.

| Action | Call | Minimum role |
| --- | --- | --- |
| The queue | \`POST /admin/orders/filter\` | Moderator |
| One order | \`GET /admin/orders/{id}\` | Moderator |
| Move status | \`PATCH /admin/orders/{id}/status\` | Moderator |
| Fix name / phone / address / note | \`PATCH /admin/orders/{id}\` | Moderator |
| Soft delete | \`DELETE /admin/orders/{id}\` | Admin |
| Permanent delete | \`DELETE /admin/orders/{id}/permanent\` | Admin |

The admin shape carries everything the customer shape does **plus** \`userId\`,
\`client\` (the IP, OS, browser and device the order was placed from),
\`stockReleased\`, \`updatedBy\` and \`deletedAt\`.

\`search\` is one box matching order number, customer name, phone or email —
build the UI as a single field, because that is what the person on the phone
has.

### The status workflow

Only these moves are legal. Anything else is a 422
(\`ORDER_STATUS_TRANSITION_INVALID\`), so **drive the buttons from this table**
rather than offering all six statuses:

| From | Allowed next |
| --- | --- |
| \`PENDING\` | \`CONFIRMED\`, \`CANCELED\` |
| \`CONFIRMED\` | \`OUT_FOR_DELIVERY\`, \`CANCELED\` |
| \`OUT_FOR_DELIVERY\` | \`DELIVERED\`, \`RETURNED\`, \`CANCELED\` |
| \`DELIVERED\` | \`RETURNED\` |
| \`RETURNED\`, \`CANCELED\` | *terminal* |

**\`note\` is required for \`RETURNED\` and \`CANCELED\`**, optional otherwise. Make
the note field mandatory in the UI when one of those is selected, or you will
get \`ORDER_STATUS_NOTE_REQUIRED\`. Whitespace does not count.

Reaching \`DELIVERED\` also sets \`paymentStatus: "PAID"\` — cash on delivery is
settled when the courier hands it over. Reaching \`RETURNED\` or \`CANCELED\`
returns the reserved stock to the catalog.

\`statusHistory\` is append-only and carries \`{ status, note, changedBy,
changedAt }\` — render it as a timeline.

### What admins cannot do

There is **no way to edit a price, a line item, a quantity or a total** through
this API. \`PATCH /admin/orders/{id}\` reaches contact details, address and note,
nothing else. Do not build a UI that implies otherwise.

Address fields **merge** — sending only \`city\` fixes the city without wiping
the street. Sending \`note: null\` clears it; omitting it leaves it alone.

Editing is refused once an order is \`DELIVERED\`, \`RETURNED\` or \`CANCELED\`
(\`ORDER_FINALISED\`) — at that point the address is the record of where the
goods actually went.

---

## Admin: catalog

| Resource | Create | List | Update |
| --- | --- | --- | --- |
| Products | \`POST /products\` | \`POST /products/filter\` | \`PUT /products/{id}\` or a section patch |
| Categories | \`POST /categories\` | \`POST /categories/filter\` | \`PUT /categories/{id}\` |
| Brands | \`POST /brands\` | \`POST /brands/filter\` | \`PUT /brands/{id}\` |
| Attributes | \`POST /attributes\` | \`POST /attributes/filter\` | \`PUT /attributes/{id}\` |
| Variations | \`POST /variations/generate\` | \`POST /variations/filter\` | \`PATCH /variations/{id}\` |

### Use the section patches, not \`PUT\`

\`PUT /products/{id}\` requires the **whole** document, so saving a price change
means round-tripping every field — and any field your form did not load is
silently reset. Each admin panel should save through its own endpoint:

| Panel | Endpoint |
| --- | --- |
| Name, slug, brand, categories, SKU, status, visibility, featured | \`PATCH /products/{id}/general\` |
| Description, short description | \`PATCH /products/{id}/description\` |
| Prices | \`PATCH /products/{id}/pricing\` |
| Stock | \`PATCH /products/{id}/stock\` |
| Attributes, tags | \`PATCH /products/{id}/attributes\` |
| Thumbnail, gallery | \`PATCH /products/{id}/media\` |
| SEO | \`PATCH /products/{id}/seo\` |
| Featured toggle | \`PATCH /products/{id}/featured\` |
| Status toggle | \`PATCH /products/{id}/status\` |

**\`publishedAt\` is not an input.** The server stamps it on the first
transition to \`ACTIVE\`. Do not send it — it is a 422.

**\`productType\` cannot be patched.** Flipping \`VARIABLE\` to \`SIMPLE\` would
orphan every generated SKU. It is set at creation.

**Attributes replace wholesale.** \`PATCH /products/{id}/attributes\` swaps the
entire group list — send every group you want to keep. A key may appear in only
one group, and group titles must be unique; both are 422s naming the offending
index.

---

## Media uploads

\`POST /media/upload\` — \`multipart/form-data\`, file on the \`file\` field, any
signed-in role.

\`\`\`ts
const form = new FormData();
form.append("file", file);
form.append("tag", "product-gallery");   // optional grouping label

const response = await fetch(\`\${BASE}/media/upload\`, {
  method: "POST",
  headers: { Authorization: \`Bearer \${accessToken}\` },  // no Content-Type - let the browser set the boundary
  body: form,
});
\`\`\`

- **Max 3 MB**, enforced while streaming — an oversized file is rejected
  without being buffered. Check the size client-side first for a better message.
- Allowed: JPEG, PNG, WebP, GIF, AVIF. **SVG is refused** — it is a document
  format that can carry script.
- **Everything is converted to WebP server-side**, animated GIFs included. The
  response reports the saving; do not convert client-side.
- The response gives an integer \`id\` and a \`url\`. Use the \`url\` for
  \`thumbnail.src\` / \`images[].src\` on a product.
- \`POST /media/my\` lists the caller's own uploads. \`POST /media/filter\` and
  \`DELETE /media/{id}\` are admin and above.

---

## Rate limits

Endpoints sit in tiers with separate budgets. Every response carries
\`RateLimit-Limit\`, \`RateLimit-Remaining\` and \`RateLimit-Reset\`; a **429** adds
\`Retry-After\` in seconds.

Honour \`Retry-After\` rather than retrying immediately. The tightest limits are
on auth and on anything that sends mail (register, resend verification, forgot
password) — debounce those forms and disable the submit button while in flight.

---

## Rules that will bite you

1. **\`DELETE\` with a body.** \`DELETE /cart/items\` and \`DELETE /wishlist/items\`
   take JSON so a batch removal is one request instead of N that can
   half-succeed. \`fetch\` handles it; **axios needs
   \`axios.delete(url, { data: { … } })\`** — a plain second argument is treated
   as config and silently dropped.
2. **Pages start at 0.** Not 1.
3. **Strict bodies.** An unknown key is a 422. This is how a typo fails loudly.
4. **Never send prices.** Not on orders, not anywhere.
5. **Branch on \`code\`, not \`message\`.** Especially
   \`REQUIRED_PASSWORD\` and \`ORDER_ALREADY_PLACED\`.
6. **One refresh at a time.** Concurrent refreshes trip reuse detection and
   sign the user out of everything.
7. **\`VARIABLE\` products need a \`variantId\`** in the cart and at checkout;
   \`SIMPLE\` products refuse one. The wishlist takes neither.
8. **Cart lines are addressed by line \`id\`**, not product id. The wishlist is
   addressed by **product id**.
9. **Do not hide unavailable cart or wishlist rows.** They come back flagged
   precisely so the shopper can remove them.
10. **\`maxQuantity: null\` means unlimited**, not zero.
11. **Order status moves are constrained.** Read the transition table before
    building the buttons.
12. **\`note\` is mandatory for \`RETURNED\` and \`CANCELED\`.**

---

`;

module.exports = { GUIDE };
