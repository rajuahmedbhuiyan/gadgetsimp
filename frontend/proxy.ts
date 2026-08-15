import { NextResponse, type NextRequest } from "next/server";

import type { ApiEnvelope, Session, User } from "@/lib/api/types";
import { safeRedirectPath } from "@/lib/search-params";
import {
  ACCESS_COOKIE,
  isUsable,
  REFRESH_COOKIE,
  tokenExpiry,
} from "@/lib/auth/tokens";
import { hasRole } from "@/lib/auth/roles";
import { encodeUserHeader, USER_HEADER } from "@/lib/auth/user-header";
import { isPanelPath, requiredRoleFor } from "@/lib/panel/access";

/**
 * The session, resolved on the server before anything renders.
 *
 * Both calls the browser used to make now happen here, against the API
 * directly:
 *
 *   POST /auth/refresh  - only when the access token is missing or within a
 *                         minute of expiring. Once every fifteen minutes in
 *                         practice, not once per navigation: rotating on every
 *                         request would trip the API's reuse detection.
 *   GET  /users/me      - the authoritative record, handed to the render in a
 *                         request header so server components have the user
 *                         without a round trip of their own.
 *
 * The page boots already knowing who it is talking to, so there is no
 * signed-out flash and no auth call from the client on load.
 */

const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";

/** Pages that are useless without a session. */
const REQUIRES_SESSION = ["/change-password"];

/** Pages that are useless *with* one. */
const GUEST_ONLY = ["/login", "/register"];

interface Resolved {
  user: User | null;
  /** Set when this request rotated the tokens and must write them back. */
  issued: Session | null;
  /** Set when the refresh token turned out to be dead. */
  expired: boolean;
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const { user, issued, expired } = await resolveSession(request);

  const response = route(request, pathname, searchParams, user);

  if (issued) {
    // Middleware's fetch never sees the API's own Set-Cookie - that response
    // came back to this server, not to the browser - so the rotated token has
    // to be written on the way out or the next request replays a spent one.
    response.cookies.set(REFRESH_COOKIE, issued.refreshToken!, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    response.cookies.set(ACCESS_COOKIE, issued.accessToken, {
      // Readable on purpose: the browser calls the API directly and needs a
      // bearer token. The refresh token above stays out of its reach.
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: expirySeconds(issued.accessToken),
    });
  }

  if (expired) {
    response.cookies.delete(REFRESH_COOKIE);
    response.cookies.delete(ACCESS_COOKIE);
  }

  return response;
}

async function resolveSession(request: NextRequest): Promise<Resolved> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;

  if (!refreshToken && !accessToken) {
    return { user: null, issued: null, expired: false };
  }

  // Still-good token: no rotation, just read the user.
  if (isUsable(accessToken)) {
    const user = await fetchUser(request, accessToken!);
    if (user) return { user, issued: null, expired: false };
  }

  if (!refreshToken) {
    return { user: null, issued: null, expired: Boolean(accessToken) };
  }

  const issued = await refresh(request, refreshToken);
  if (!issued) return { user: null, issued: null, expired: true };

  const user = await fetchUser(request, issued.accessToken);
  return { user, issued, expired: false };
}

/**
 * One refresh per token, per process.
 *
 * Rotation is theft detection on this API and there is no grace window, so two
 * requests presenting the same token would drop every session the user has. A
 * document request and its data fetch arriving together share one rotation.
 *
 * Per process, though: several instances behind a load balancer can still
 * race. The durable fix is a grace window in `auth.service.refresh`.
 */
const inFlight = new Map<string, Promise<Session | null>>();

function refresh(request: NextRequest, refreshToken: string) {
  let attempt = inFlight.get(refreshToken);

  if (!attempt) {
    attempt = runRefresh(request, refreshToken).finally(() => {
      inFlight.delete(refreshToken);
    });
    inFlight.set(refreshToken, attempt);
  }

  return attempt;
}

async function runRefresh(request: NextRequest, refreshToken: string) {
  const payload = await callApi<Session>(request, "/auth/refresh", {
    method: "POST",
    // Server to server, so the cookie has to be presented by hand.
    headers: { Cookie: `${REFRESH_COOKIE}=${refreshToken}` },
  });

  // The API returns the rotated token in the body for non-browser clients, and
  // this server is one - it sends no Origin header. Without that there would
  // be nothing to write back.
  return payload?.success && payload.data.refreshToken ? payload.data : null;
}

async function fetchUser(request: NextRequest, accessToken: string) {
  const payload = await callApi<{ user: User }>(request, "/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return payload?.success ? payload.data.user : null;
}

async function callApi<T>(
  request: NextRequest,
  path: string,
  init: { method?: string; headers?: Record<string, string> },
): Promise<ApiEnvelope<T> | null> {
  if (!API) return null;

  const headers = new Headers(init.headers);

  // The API's rate limits key on the caller's IP. Without this every customer
  // would share this server's address.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) headers.set("X-Forwarded-For", forwarded);

  try {
    const response = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers,
      cache: "no-store",
    });

    return (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  } catch {
    // The API being unreachable is not the same as being signed out; the
    // caller treats a null as "could not resolve" and leaves cookies alone.
    return null;
  }
}

function expirySeconds(token: string) {
  const expiry = tokenExpiry(token);
  return expiry ? Math.max(0, Math.floor((expiry - Date.now()) / 1000)) : 900;
}

function matches(pathname: string, routes: string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function route(
  request: NextRequest,
  pathname: string,
  searchParams: URLSearchParams,
  user: User | null,
) {
  // The control panel, turned away before a byte of it renders. An optimistic
  // check in the sense the Next docs mean: the session was resolved above from
  // the API, but the layout re-reads the same user and the API re-checks the
  // role on every call it serves, so this is the cheap first gate rather than
  // the only one.
  if (isPanelPath(pathname)) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    if (!hasRole(user, requiredRoleFor(pathname))) {
      // Signed in, just not staff. Home rather than a 403 page: there is
      // nothing here for them to be told about, and a shopper who mistyped a
      // URL should land somewhere useful.
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (!user && matches(pathname, REQUIRES_SESSION)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && matches(pathname, GUEST_ONLY)) {
    const url = request.nextUrl.clone();
    url.pathname = safeRedirectPath(searchParams.get("next") ?? undefined);
    url.search = "";
    return NextResponse.redirect(url);
  }

  const headers = new Headers(request.headers);
  // Never let a forged header pass for a resolved session.
  headers.delete(USER_HEADER);
  if (user) headers.set(USER_HEADER, encodeUserHeader(user));

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    // Everything that renders. A font has no session.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
