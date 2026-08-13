/**
 * Messages the login page shows when another flow sent the user there.
 *
 * Keyed by a `?notice=` slug rather than by passing prose through the URL, so
 * the wording stays here and cannot be spoofed into the page.
 */
export const LOGIN_NOTICES: Record<string, string> = {
  "password-reset": "Your password was reset. Sign in with the new one.",
  "password-changed":
    "Your password was changed, which signed out every device. Sign in again.",
  "session-expired": "Your session ended. Sign in again.",
  "signed-out": "You are signed out.",
  "verify-email": "Confirm your email address first, then sign in.",
};

export function loginNotice(value: string | string[] | undefined) {
  const key = Array.isArray(value) ? value[0] : value;
  return key ? (LOGIN_NOTICES[key] ?? null) : null;
}
