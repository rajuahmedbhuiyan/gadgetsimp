/**
 * The API client.
 *
 * Two things it deliberately does *not* do: hold the access token, and
 * refresh. Middleware owns both - it resolves the session before anything
 * renders and writes the token to a cookie this reads. That leaves exactly one
 * thing in the app that ever calls `/auth/refresh`, which is what keeps the
 * API's rotation from seeing a token replayed.
 *
 * On a 401 it asks its own server to re-resolve rather than refreshing itself:
 * one same-origin request runs middleware, which rotates if it needs to and
 * writes a fresh cookie. Then the original call is retried once.
 */

import {
  clearAccessTokenCookie,
  readAccessToken,
  writeAccessToken,
} from "@/lib/auth/tokens";

import type { ApiEnvelope, ApiFieldError, Session } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export function getAccessToken() {
  return readAccessToken();
}

/* ------------------------------- errors -------------------------------- */

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly errors: ApiFieldError[];
  /** Seconds from the `Retry-After` header, on a 429. */
  readonly retryAfter?: number;

  constructor(
    statusCode: number,
    message: string,
    code?: string,
    errors: ApiFieldError[] = [],
    retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.retryAfter = retryAfter;
  }

  /**
   * Field name -> message, ready to hand to a form library. The server
   * prefixes the path with its location (`body.email`); form controls are
   * named without it.
   *
   * One field can fail several rules at once - a password can be short *and*
   * have no digit - and a control shows one message, so they are joined rather
   * than silently dropped.
   */
  get fieldErrors(): Record<string, string> {
    const grouped = new Map<string, string[]>();

    for (const error of this.errors) {
      const field = error.field.replace(/^(body|params|query)\./, "");
      const messages = grouped.get(field) ?? [];
      if (!messages.includes(error.message)) messages.push(error.message);
      grouped.set(field, messages);
    }

    return Object.fromEntries(
      [...grouped].map(([field, messages]) => [field, messages.join(". ")]),
    );
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/* ---------------------------- session events ---------------------------- */

export type AuthEvent =
  | { type: "session"; session: Session }
  | { type: "signed-out" };

const listeners = new Set<(event: AuthEvent) => void>();

/** Subscribe to session changes. Returns an unsubscribe function. */
export function onAuthEvent(listener: (event: AuthEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(event: AuthEvent) {
  for (const listener of [...listeners]) listener(event);
}

/**
 * Store a freshly issued session.
 *
 * The API set the refresh cookie itself; this only records the access token so
 * the next navigation does not have to rotate for one the page already has.
 */
export function applySession(session: Session) {
  writeAccessToken(session.accessToken);
  emit({ type: "session", session });
}

/** Drop the local session. Safe to call when already signed out. */
export function clearSession() {
  clearAccessTokenCookie();
  emit({ type: "signed-out" });
}

/* -------------------------------- renewal ------------------------------- */

let renewing: Promise<string | null> | null = null;

/**
 * Ask this app's own server to re-resolve the session.
 *
 * A same-origin request runs middleware, which refreshes if the token is stale
 * and writes the new one to the cookie. The client never touches
 * `/auth/refresh`, so there is only ever one refresher.
 */
function renew(): Promise<string | null> {
  renewing ??= (async () => {
    try {
      await fetch(window.location.pathname, {
        method: "HEAD",
        credentials: "same-origin",
        cache: "no-store",
      });
      return readAccessToken();
    } catch {
      return null;
    } finally {
      renewing = null;
    }
  })();

  return renewing;
}

/* --------------------------------- api ---------------------------------- */

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Internal: false on the retry that follows a renewal. */
  retryOnUnauthorized?: boolean;
}

/**
 * Endpoints where a 401 means "these credentials are wrong", not "this access
 * token is stale". Renewing would not help, and retrying would spend a second
 * attempt from a rate-limit budget that only counts failures.
 */
const CREDENTIAL_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/social-login",
  "/auth/verify-email",
  "/auth/complete-registration",
  "/auth/resend-verification",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/change-password",
];

/** The only 401 codes a fresh token can fix. `TOKEN_REVOKED` is not one. */
const RENEWABLE_CODES = new Set([
  "TOKEN_MISSING",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
]);

function shouldRenew(
  status: number,
  path: string,
  code: string | undefined,
  retry: boolean,
) {
  if (status !== 401 || !retry) return false;
  if (CREDENTIAL_PATHS.some((prefix) => path.startsWith(prefix))) return false;
  return code === undefined || RENEWABLE_CODES.has(code);
}

function retryAfterSeconds(response: Response) {
  const header = response.headers.get("Retry-After");
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

export async function api<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiEnvelope<T>> {
  const {
    method = "GET",
    body,
    headers,
    signal,
    retryOnUnauthorized = true,
  } = options;

  const accessToken = readAccessToken();
  let response: Response;

  /*
   * A file upload goes out as multipart, which means two departures from the
   * JSON path: the body is passed through untouched, and `Content-Type` is
   * left off entirely so the browser can set it *with* the boundary parameter
   * it generates. Setting it by hand produces a header with no boundary, and
   * multer answers 500 on a body it cannot split.
   */
  const isMultipart =
    typeof FormData !== "undefined" && body instanceof FormData;

  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      // The refresh cookie is httpOnly; the browser only attaches it when
      // credentials are included, and the API only sets one if they are.
      credentials: "include",
      signal,
      headers: {
        ...(body !== undefined && !isMultipart
          ? { "Content-Type": "application/json" }
          : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : isMultipart
            ? (body as FormData)
            : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "Could not reach the server. Check your connection.");
  }

  const payload = (await response
    .json()
    .catch(() => null)) as ApiEnvelope<T> | null;

  if (shouldRenew(response.status, path, payload?.code, retryOnUnauthorized)) {
    const renewed = await renew();
    if (renewed) {
      return api<T>(path, { ...options, retryOnUnauthorized: false });
    }
    // Middleware could not resolve a session either, so it really is over.
    clearSession();
  }

  if (!response.ok || !payload?.success) {
    throw new ApiError(
      payload?.statusCode ?? response.status,
      payload?.message ?? "Request failed",
      payload?.code,
      payload?.errors ?? [],
      retryAfterSeconds(response),
    );
  }

  return payload;
}
