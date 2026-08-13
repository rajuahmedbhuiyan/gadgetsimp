# GadgetSimp Auth — Frontend Integration Spec

Everything the frontend needs to implement authentication against this API.
Paste this whole file into an AI coding agent as context, or read it as a
reference. It is written against the live source, not from memory.

- **Base URL** — `http://localhost:4000/api/v1` in development (`API_PREFIX` +
  `PORT`). Referred to below as `BASE`.
- **All auth routes** live under `BASE/auth`.
- **Interactive reference** — Swagger UI at `/api/v1/docs`.

---

## 1. The ground rules

### Every response uses one envelope

Success:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Signed in successfully",
  "data": { "user": {}, "accessToken": "..." },
  "code": "OPTIONAL_MACHINE_CODE"
}
```

Error:

```json
{
  "success": false,
  "statusCode": 422,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "errors": [{ "field": "body.password", "message": "Password must contain a number" }]
}
```

Three rules follow from this:

1. **Branch on `code`, never on `message`.** Wording changes; codes are stable.
2. **`errors[].field` maps straight onto a form control** — it is dot-pathed and
   prefixed with its location (`body.email`, `params.id`).
3. **Show `message` at the top of the form**, and each `errors[].message` on its
   own field.

### Every request schema is strict

An unrecognised key is a **422**, not a silently ignored field. If you send
`{ fullName, email, password, newsletter: true }` the whole request fails. This
is deliberate — a typo fails loudly instead of doing nothing.

It is also the privilege guard: `role` is not in any registration schema, so
`{ "email": "...", "role": "ROLE_ADMIN" }` is rejected outright rather than
quietly dropped. Do not send `role` on signup.

### Field rules

| Field | Rule |
| --- | --- |
| `fullName` | 1–120 chars. Letters, marks, spaces, `'`, `.`, `-`. Must start with a letter. **One field — there is no `firstName`/`lastName`.** A single word is valid. |
| `email` | Valid address, max 160. Lowercased and trimmed server-side. |
| `password` | 8–128 chars, and must contain a lowercase letter, an uppercase letter, and a digit. |
| `phone` | Optional. `+`, digits, spaces, hyphens; 7–20 chars. |

---

## 2. The session model

| Token | Lifetime | Where it lives |
| --- | --- | --- |
| Access | 15 minutes | `Authorization: Bearer <token>` header. Keep in memory. |
| Refresh | 30 days, rotated on every use | httpOnly cookie `gs_refresh_token` |

**The refresh cookie is httpOnly** — JavaScript cannot read it, which is what
stops XSS from stealing a session. Three consequences:

- You **must** send `credentials: "include"` on `/auth/refresh` and `/auth/logout`.
- Your origin **must** be in the server's `CORS_ORIGINS` allow-list, or the
  browser will not send the cookie. `credentials: true` means the server cannot
  use `*`.
- The cookie is **path-scoped to `/api/v1/auth`**. It is not attached to catalog
  or order requests, which is intended — do not go looking for it there.

**Rotation is theft detection.** Each refresh invalidates the token it consumed.
If an already-rotated token is presented again, the server assumes it was stolen
and drops **every** session for that user (`REFRESH_TOKEN_REUSED`).

> **The single most important implementation detail on this page:** never fire
> two refreshes concurrently. Two components each hitting a 401 and each calling
> refresh will sign your user out of everything. De-duplicate with a
> single-flight promise — see §10.

### Access token payload

The JWT carries `sub`, `role`, `tokenVersion`, `fullName`, `email`, `phone`. You
may decode it to render a header without an extra round trip.

**Do not trust it for authorisation.** A JWT is signed, not encrypted — anyone
holding it can read those claims — and they are a 15-minute snapshot that can go
stale. Nothing server-side trusts them; every request re-reads the user from the
database. Use it for display, not for deciding what a user may do.

### Non-browser clients

`REFRESH_TOKEN_IN_BODY=true` (the current setting) also returns `refreshToken`
in the JSON body, for clients that cannot hold cookies — native apps, CLIs,
Postman. A browser app should ignore that field and rely on the cookie.

### Roles

`ROLE_CUSTOMER` → `ROLE_MODERATOR` → `ROLE_ADMIN` → `ROLE_OWNER`, ranked, and
permissions accumulate upward: anything a moderator can do, an admin and owner
can too. Endpoints state a *minimum* role.

---

## 3. Registration

Two-step by design: **`POST /auth/register` creates no account.** It records the
signup and emails a link. The account exists only after the link is clicked.

### Step 1 — submit the form

```http
POST /auth/register
{ "fullName": "Raju Ahmed", "email": "raju@example.com", "password": "Str0ngPass", "phone": "+8801712345678" }
```

→ **202 Accepted**, `data: { email }`.

202, not 201, is literal: understood, not yet acted upon. Render *"check your
inbox"* — do **not** sign the user in, and do not expect a token.

**The response is identical whether or not the address was already taken.** That
is deliberate anti-enumeration: you cannot tell registered addresses from free
ones, and neither can an attacker. If the address exists, the real account
holder gets a "someone tried to sign up" email instead. Never write UI that
claims "this email is available".

### Step 2 — the user clicks the emailed link

The link points at **your frontend**, not the API:
`{APP_URL}/verify-email?token=...`. Build that route, read `token` from the
query string, and POST it back.

```http
POST /auth/verify-email
{ "token": "<from the query string>" }
```

**This endpoint has two success outcomes and you must tell them apart.** Both
are 200-family. Branch on `code`:

| Outcome | Status | `code` | Meaning |
| --- | --- | --- | --- |
| Normal signup | **201** | *(none)* | Account created, session issued. `data` is `{ user, accessToken }`. |
| Checkout signup | **200** | `REQUIRED_PASSWORD` | Address confirmed, **no account and no session yet**. `data` is `{ registrationToken, email, fullName }`. |

```ts
const { code, data } = await api("/auth/verify-email", { method: "POST", body: { token } });

if (code === "REQUIRED_PASSWORD") {
  openPasswordModal(data.registrationToken);   // second step below
} else {
  setAccessToken(data.accessToken);            // already signed in
  router.push("/");
}
```

The second case exists because a guest who checked out was never shown a
password field. **No session is issued there on purpose**: a link that arrived
by email proves only mailbox access, so treating it as a login would make a
forwarded message an account takeover.

Links are valid for **10 minutes**.

### Step 3 — only for the `REQUIRED_PASSWORD` branch

```http
POST /auth/complete-registration
{ "token": "<the registrationToken from step 2>", "password": "Str0ngPass" }
```

→ **201**, `data: { user, accessToken }`. Signed in.

> **The token here is the `registrationToken` from step 2's response, not the
> one from the email.** The emailed token was spent by step 2 and is rotated
> away. Sending it here returns `REGISTRATION_TOKEN_INVALID`. This ordering is
> load-bearing security, not an implementation detail.

This step has a **30-minute** window, longer than the email's 10, because the
untrusted email hop is already behind you and stranding a paying customer
mid-modal for typing slowly would be worse.

### Resending

```http
POST /auth/resend-verification
{ "email": "raju@example.com" }
```

→ 200 always, even for an unknown address (same anti-enumeration reasoning).
Each resend invalidates the previous link.

Two failure codes to surface: `RESEND_COOLDOWN` (429, one per 60 seconds — the
message names the remaining seconds) and `RESEND_LIMIT_REACHED` (429, max 5 per
pending signup).

---

## 4. Login

```http
POST /auth/login
{ "email": "raju@example.com", "password": "Str0ngPass" }
```

→ **200**, `data: { user, accessToken }`, plus the refresh cookie.

`INVALID_CREDENTIALS` (401) covers *both* "no such user" and "wrong password" —
one message, deliberately. It is also what a social-only account gets when it
tries to log in with a password. Do not try to distinguish these in the UI; the
server will not help you, by design.

`ACCOUNT_DISABLED` (403) means suspended or deleted. That one is worth its own
message.

---

## 5. Social login

**One endpoint for every provider, and for both signup and sign-in.** The user
taps a button and expects to end up signed in either way; the response does not
say whether an account was created (hence 200, not 201).

### First, ask what is available

```http
GET /auth/providers
```

→ `data: { providers: ["EMAIL", "GOOGLE", "FACEBOOK"] }`

Render only the buttons in that list. A deployment may have Google configured
and Facebook not — hard-coding both means shipping a button that 503s.

### Then exchange the provider's credential

```http
POST /auth/social-login
{ "type": "GOOGLE", "token": "<credential from the provider SDK>" }
```

→ **200**, `data: { user, accessToken }`.

What goes in `token` differs by provider, which is why the field is named
neutrally:

| `type` | `token` is | From |
| --- | --- | --- |
| `GOOGLE` | the **ID token** (a JWT, often >1KB) | `credential` in the Google Identity Services callback |
| `FACEBOOK` | the **access token** (opaque) | `authResponse.accessToken` from `FB.login()` |

Everything is verified server-side — Google's signature against its JWKS,
Facebook's token against the Graph debug endpoint. Nothing you send is trusted
as presented.

**Account linking is automatic.** If the provider's verified email matches an
existing account, the provider is linked to it rather than creating a duplicate.
The same person signing in with Google and then Facebook ends up with one
account carrying both in `user.authProviders`.

Social-specific errors worth handling:

| Code | Status | What to do |
| --- | --- | --- |
| `SOCIAL_EMAIL_MISSING` | 400 | The provider released no email (common on Facebook accounts registered by phone, or when the permission was declined). Ask the user to grant email permission or sign up with email. |
| `SOCIAL_EMAIL_UNVERIFIED` | 401 | Google says the address is unverified. Refused — accepting it would be an account-takeover path. |
| `SOCIAL_PROVIDER_NOT_CONFIGURED` | 503 | This deployment cannot serve that provider. You should not have rendered the button — see `/auth/providers`. |
| `SOCIAL_TOKEN_EXPIRED` | 401 | Re-run the provider SDK flow and retry. |

---

## 6. Refresh — keeping the session alive

```ts
fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "include" });
```

No body, no bearer header. The cookie is the credential.

→ **200**, `data: { user, accessToken }`, and a **new** refresh cookie. The old
one is now dead.

### When to call it

- **On a 401 from any request** — refresh once, then retry the original request.
  If refresh also fails, the session is over: clear state and route to login.
- **On app boot / tab focus**, to recover a session across a page reload. See §7.

### When *not* to call it

- Not on a 403 — that is a permissions problem, and refreshing will not fix it.
- Not concurrently. Ever. See the single-flight client in §10.

### Failure codes

| Code | Status | Meaning |
| --- | --- | --- |
| `REFRESH_TOKEN_MISSING` | 401 | No cookie was sent. Usually a CORS/`credentials` mistake, not an expired session — check that first. |
| `REFRESH_TOKEN_INVALID` | 401 | Malformed or expired. |
| `SESSION_INVALID` | 401 | The user no longer exists or may not sign in. |
| `TOKEN_REVOKED` | 401 | Password changed or "sign out everywhere" ran. |
| `REFRESH_TOKEN_REUSED` | 401 | **A rotated token was replayed.** Every session was just dropped. Almost always caused by concurrent refreshes in your own client. |

All five mean the same thing to the UI: clear the access token and send the user
to login.

---

## 7. Revalidation — restoring a session on page load

The access token lives in memory, so a reload loses it. The refresh cookie
survives. So the boot sequence is:

```ts
async function restoreSession() {
  const ok = await refresh();          // single-flight, credentials: "include"
  if (!ok) return null;                // genuinely signed out
  return getCurrentUser();             // GET /auth/me
}
```

Run it once, at app start, before rendering anything auth-dependent. Hold the
app in a loading state until it settles — rendering a signed-out shell first and
correcting it a moment later is the flicker every app of this shape gets wrong.

### `GET /auth/me`

```http
GET /auth/me
Authorization: Bearer <accessToken>
```

→ `data: { user }` — the authoritative, freshly-read user record.

Use this, not the JWT claims, whenever the answer matters: role changes,
suspension, and profile edits all land here immediately, while the token keeps
its 15-minute-old snapshot. Re-fetch it after any profile or role change.

`GET /users/me` returns the same thing and is metered on the read tier; either
works.

---

## 8. Passwords

### Forgot → reset

```http
POST /auth/forgot-password
{ "email": "raju@example.com" }
```

→ **200 always**, even for an address with no account. Same anti-enumeration
rule as registration — never render "no account found".

The email links to **your** frontend: `{APP_URL}/reset-password?token=...`.
Build that route.

```http
POST /auth/reset-password
{ "token": "<from the query string>", "newPassword": "N3wStrongPass" }
```

→ 200. Valid for **10 minutes**, single use.

**Every session is revoked** and no new one is issued — route the user to login
with a success message. Do not attempt to auto-sign-in.

A social-only account may reset too; doing so *adds* `EMAIL` to its
`authProviders` rather than replacing anything.

Codes: `RESET_TOKEN_INVALID`, `RESET_TOKEN_EXPIRED` (both 400).

### Change password (signed in)

```http
POST /auth/change-password
Authorization: Bearer <accessToken>
{ "currentPassword": "Str0ngPass", "newPassword": "N3wStrongPass" }
```

→ 200. `newPassword` must differ from `currentPassword` (422 if not).

**All sessions end, including this one.** The user must sign in again — that is
the point of changing a password after a suspected compromise. Clear your access
token and route to login.

`PASSWORD_NOT_SET` (400) means a social-only account with no password to change.
Offer the forgot-password flow instead, which will set one.

---

## 9. Logout

```http
POST /auth/logout           # this device
POST /auth/logout-all       # every device
```

Both need the bearer header **and** `credentials: "include"`. Both clear the
cookie server-side.

`logout-all` bumps `tokenVersion`, which invalidates every outstanding access
token immediately, not just the stored refresh sessions.

Clear your in-memory token regardless of the response — a failed logout call
should still log the user out locally.

---

## 10. Reference client

Handles the three things every call needs: the envelope, the bearer token, and a
**single-flight** refresh on 401.

```ts
const BASE = process.env.NEXT_PUBLIC_API_URL!; // http://localhost:4000/api/v1

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) { accessToken = token; }
export function getAccessToken() { return accessToken; }

export interface ApiFieldError { field: string; message: string; }

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public errors: ApiFieldError[] = [],
  ) { super(message); }

  /** Field name -> message, ready for a form library. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      this.errors.map((e) => [e.field.replace(/^body\./, ""), e.message]),
    );
  }
}

/**
 * Only ever one refresh in flight. Concurrent refreshes trip the server's
 * reuse detection and drop every session the user has.
 */
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
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

export async function api<T = any>(
  path: string,
  { method = "GET", body, retry = true }: {
    method?: string; body?: unknown; retry?: boolean;
  } = {},
): Promise<{ data: T; message: string; code?: string; meta?: any }> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const payload = await response.json().catch(() => null);

  if (response.status === 401 && retry && !path.startsWith("/auth/refresh")) {
    if (await refresh()) return api<T>(path, { method, body, retry: false });
    setAccessToken(null);
  }

  if (!payload?.success) {
    throw new ApiError(
      response.status,
      payload?.message ?? "Request failed",
      payload?.code,
      payload?.errors ?? [],
    );
  }

  return payload;
}

/* ------------------------------ auth calls ------------------------------ */

export const auth = {
  register: (body: { fullName: string; email: string; password: string; phone?: string }) =>
    api("/auth/register", { method: "POST", body }),

  verifyEmail: (token: string) =>
    api("/auth/verify-email", { method: "POST", body: { token } }),

  completeRegistration: (token: string, password: string) =>
    api("/auth/complete-registration", { method: "POST", body: { token, password } }),

  resendVerification: (email: string) =>
    api("/auth/resend-verification", { method: "POST", body: { email } }),

  login: (email: string, password: string) =>
    api("/auth/login", { method: "POST", body: { email, password } }),

  socialLogin: (type: "GOOGLE" | "FACEBOOK", token: string) =>
    api("/auth/social-login", { method: "POST", body: { type, token } }),

  providers: () => api<{ providers: string[] }>("/auth/providers"),

  me: () => api("/auth/me"),

  forgotPassword: (email: string) =>
    api("/auth/forgot-password", { method: "POST", body: { email } }),

  resetPassword: (token: string, newPassword: string) =>
    api("/auth/reset-password", { method: "POST", body: { token, newPassword } }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),

  logout: () => api("/auth/logout", { method: "POST" }),
  logoutAll: () => api("/auth/logout-all", { method: "POST" }),
};
```

---

## 11. Endpoint reference

All paths relative to `BASE`. "Auth" means a bearer token is required.

| Method | Path | Auth | Body | Success |
| --- | --- | --- | --- | --- |
| POST | `/auth/register` | — | `fullName, email, password, phone?` | 202 `{ email }` |
| POST | `/auth/verify-email` | — | `token` | 201 session **or** 200 `REQUIRED_PASSWORD` |
| POST | `/auth/complete-registration` | — | `token, password` | 201 session |
| POST | `/auth/resend-verification` | — | `email` | 200 |
| POST | `/auth/social-login` | — | `type, token` | 200 session |
| GET | `/auth/providers` | — | — | 200 `{ providers }` |
| POST | `/auth/login` | — | `email, password` | 200 session |
| POST | `/auth/refresh` | cookie | — | 200 session |
| POST | `/auth/logout` | ✓ | — | 200 |
| POST | `/auth/logout-all` | ✓ | — | 200 |
| POST | `/auth/forgot-password` | — | `email` | 200 |
| POST | `/auth/reset-password` | — | `token, newPassword` | 200 |
| POST | `/auth/change-password` | ✓ | `currentPassword, newPassword` | 200 |
| GET | `/auth/me` | ✓ | — | 200 `{ user }` |
| GET | `/users/me` | ✓ | — | 200 `{ user }` |
| PATCH | `/users/me` | ✓ | `fullName?, phone?, image?` (≥1) | 200 `{ user }` |

"session" = `{ user, accessToken }` in `data`, plus the rotated refresh cookie.

### The user object

```json
{
  "id": 1003,
  "fullName": "Raju Ahmed",
  "email": "raju@example.com",
  "role": "ROLE_CUSTOMER",
  "authProviders": ["EMAIL"],
  "phone": "+8801712345678",
  "image": null,
  "status": "ACTIVE",
  "emailVerifiedAt": "2026-08-13T10:00:00.000Z",
  "lastLoginAt": "2026-08-13T10:00:00.000Z",
  "createdAt": "2026-08-13T10:00:00.000Z",
  "updatedAt": "2026-08-13T10:00:00.000Z"
}
```

`id` is an **integer**, not a string. `password`, `sessions`, `tokenVersion` and
`socialAccounts` are never returned.

---

## 12. Rate limits

Limits return **429** with code `RATE_LIMIT_EXCEEDED` and a `Retry-After`
header. Read `RateLimit` / `Retry-After` and back off; do not blind-retry.

| Endpoints | Budget |
| --- | --- |
| `/auth/register` | 5 per hour, per IP |
| `/auth/login`, `/refresh`, `/verify-email`, `/complete-registration`, `/social-login` | 10 per 15 min — **failures only**, keyed on IP + email |
| `/auth/forgot-password`, `/reset-password`, `/change-password`, `/resend-verification` | 5 per hour |
| `/auth/providers`, reads | 120 per minute |
| Writes | 40 per minute |
| Everything | 900 per 15 min |

Successful logins do not consume the auth budget — only failed attempts do, so a
user typing their password correctly is never locked out.

---

## 13. Error codes

| Code | Status | Where |
| --- | --- | --- |
| `VALIDATION_ERROR` | 422 | Any invalid or unrecognised field. Check `errors[]`. |
| `VERIFICATION_TOKEN_INVALID` / `_EXPIRED` | 400 | `/verify-email`. Offer resend. |
| `REGISTRATION_TOKEN_INVALID` / `_EXPIRED` | 400 | `/complete-registration`. |
| `EMAIL_NOT_VERIFIED` | 400 | `/complete-registration` called before `/verify-email`. |
| `PASSWORD_ALREADY_SET` | 400 | That signup already has a password — send to login. |
| `EMAIL_ALREADY_REGISTERED` | 409 | Registered between the email being sent and the click. |
| `RESEND_COOLDOWN` / `RESEND_LIMIT_REACHED` | 429 | `/resend-verification`. |
| `INVALID_CREDENTIALS` | 401 | Login, or a wrong `currentPassword`. |
| `ACCOUNT_DISABLED` | 403 | Suspended or deleted. |
| `SOCIAL_EMAIL_MISSING` | 400 | Provider released no email. |
| `SOCIAL_EMAIL_UNVERIFIED` | 401 | Provider's email is unverified. |
| `SOCIAL_PROVIDER_NOT_CONFIGURED` | 503 | Not enabled on this deployment. |
| `SOCIAL_PROVIDER_UNSUPPORTED` | 400 | Unknown `type`. |
| `SOCIAL_TOKEN_INVALID` / `_EXPIRED` / `_WRONG_AUDIENCE` | 401 | Re-run the provider flow. |
| `SOCIAL_VERIFICATION_FAILED` / `SOCIAL_PROFILE_MISMATCH` | 401 | Provider verification failed. |
| `TOKEN_MISSING` / `TOKEN_INVALID` / `TOKEN_EXPIRED` | 401 | Bearer token problem → refresh. |
| `TOKEN_REVOKED` | 401 | Password changed or signed out everywhere. |
| `REFRESH_TOKEN_MISSING` / `_INVALID` / `_REUSED`, `SESSION_INVALID` | 401 | Session over → login. |
| `RESET_TOKEN_INVALID` / `_EXPIRED` | 400 | `/reset-password`. |
| `PASSWORD_NOT_SET` | 400 | Social-only account, no password to change. |
| `USER_NOT_FOUND` | 401 | Account deleted mid-session. |
| `INSUFFICIENT_ROLE` | 403 | Signing in again will not help. |
| `RATE_LIMIT_EXCEEDED` | 429 | Back off per `Retry-After`. |

---

## 14. Frontend routes you must build

The API emails links that point at **your** app. Without these routes the flows
dead-end:

| Route | Reads | Then |
| --- | --- | --- |
| `/verify-email?token=…` | `token` | POST `/auth/verify-email`, branch on `REQUIRED_PASSWORD` |
| `/reset-password?token=…` | `token` | Collect a password, POST `/auth/reset-password` |
| `/login` | — | Linked from several emails |

Set `APP_URL` on the server to your frontend's origin so the links resolve.

---

## 15. Checklist

- [ ] `credentials: "include"` on **every** request, and your origin in `CORS_ORIGINS`
- [ ] Access token in memory only — not `localStorage`
- [ ] Single-flight refresh (concurrent refreshes = signed out everywhere)
- [ ] `restoreSession()` on boot, with a loading state to avoid auth flicker
- [ ] `/verify-email` branches on `code === "REQUIRED_PASSWORD"`
- [ ] `/complete-registration` sends the **`registrationToken`**, not the emailed one
- [ ] `/auth/providers` drives which social buttons render
- [ ] Registration and forgot-password never reveal whether an address exists
- [ ] Password change and reset both route to login — every session ends
- [ ] Errors branch on `code`; `errors[].field` maps onto form controls
- [ ] `fullName` is one field — no `firstName`/`lastName` anywhere
