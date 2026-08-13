/**
 * The two cookies the session runs on, and the one thing worth reading out of
 * a token.
 *
 * `gs_refresh_token` is the API's own cookie - httpOnly, 30 days, rotated on
 * every use. Now that it is path `/`, this app's middleware receives it too,
 * which is what lets the refresh happen on the server instead of in the page.
 *
 * `gs_access_token` is written by middleware after a refresh. It is readable
 * by script on purpose: the browser still calls the API directly for its own
 * requests and needs a bearer token to do it. That is the same exposure as
 * holding the token in a module variable - script that can read one can read
 * the other - and it buys the thing that matters, which is that the *refresh*
 * token never comes near JavaScript.
 */

export const REFRESH_COOKIE = "gs_refresh_token";
export const ACCESS_COOKIE = "gs_access_token";

/** Refresh this far ahead of expiry, so a request never races the deadline. */
export const EXPIRY_SKEW_MS = 60_000;

/**
 * The `exp` claim, without verifying the signature.
 *
 * Safe because nothing is authorised on it: it only decides when to refresh.
 * The API verifies every token itself and treats these claims as untrusted,
 * exactly as the spec says to.
 */
export function tokenExpiry(token: string): number {
  const payload = token.split(".")[1];
  if (!payload) return 0;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (character) =>
      character.charCodeAt(0),
    );
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as {
      exp?: number;
    };

    return typeof claims.exp === "number" ? claims.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function isUsable(token: string | undefined, skew = EXPIRY_SKEW_MS) {
  if (!token) return false;
  const expiry = tokenExpiry(token);
  return expiry > 0 && expiry - skew > Date.now();
}

/* ----------------------------- browser side ----------------------------- */

export function readAccessToken(): string | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${ACCESS_COOKIE}=`));

  return match ? decodeURIComponent(match.slice(ACCESS_COOKIE.length + 1)) : null;
}

/**
 * Written after a sign-in so the first navigation does not have to rotate the
 * refresh token for a token the page already has.
 */
export function writeAccessToken(token: string) {
  if (typeof document === "undefined") return;

  const expiry = tokenExpiry(token);
  const maxAge = expiry ? Math.max(0, Math.floor((expiry - Date.now()) / 1000)) : 900;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `${ACCESS_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function clearAccessTokenCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${ACCESS_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
