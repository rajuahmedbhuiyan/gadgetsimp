/**
 * Turning API failures into something a person can act on.
 *
 * The server's `message` is always safe to show, so it is the default. The map
 * below only overrides the codes where the UI can say something more useful
 * than the API can - and it is keyed on `code`, never on wording.
 */

import { isApiError } from "@/lib/api/client";

const CODE_MESSAGES: Record<string, string> = {
  // Login
  INVALID_CREDENTIALS: "Email or password is incorrect.",
  ACCOUNT_DISABLED:
    "This account has been disabled. Contact support if you think that is a mistake.",

  // Signup
  VERIFICATION_TOKEN_INVALID:
    "This confirmation link is no longer valid. Request a new one below.",
  VERIFICATION_TOKEN_EXPIRED:
    "This confirmation link has expired. Links are valid for 10 minutes - request a new one below.",
  REGISTRATION_TOKEN_INVALID:
    "This registration session is no longer valid. Start again from the link in your email.",
  REGISTRATION_TOKEN_EXPIRED:
    "This registration session expired. Start again from the link in your email.",
  EMAIL_NOT_VERIFIED: "Confirm your email address first.",
  PASSWORD_ALREADY_SET:
    "This account already has a password. Sign in instead.",
  EMAIL_ALREADY_REGISTERED:
    "That address is already registered. Sign in, or reset the password.",

  // Passwords
  RESET_TOKEN_INVALID:
    "This reset link is no longer valid. Request a new one.",
  RESET_TOKEN_EXPIRED:
    "This reset link has expired. Links are valid for 10 minutes - request a new one.",
  PASSWORD_NOT_SET:
    "This account signs in with a social provider and has no password yet. Use the forgot-password flow to set one.",

  // Social
  SOCIAL_EMAIL_MISSING:
    "That provider did not share an email address. Grant email permission, or sign up with email instead.",
  SOCIAL_EMAIL_UNVERIFIED:
    "The provider reports that address as unverified, so it cannot be used to sign in.",
  SOCIAL_PROVIDER_NOT_CONFIGURED:
    "That sign-in method is not available right now.",
  SOCIAL_PROVIDER_UNSUPPORTED: "That sign-in method is not supported.",
  SOCIAL_TOKEN_EXPIRED: "That sign-in attempt expired. Try again.",
  SOCIAL_TOKEN_INVALID: "That sign-in attempt could not be verified. Try again.",
  SOCIAL_TOKEN_WRONG_AUDIENCE:
    "That sign-in attempt could not be verified. Try again.",
  SOCIAL_VERIFICATION_FAILED:
    "The provider could not verify that sign-in. Try again.",
  SOCIAL_PROFILE_MISMATCH:
    "The provider could not verify that sign-in. Try again.",

  // Session
  TOKEN_REVOKED: "Your session ended. Sign in again.",
  SESSION_INVALID: "Your session ended. Sign in again.",
  REFRESH_TOKEN_REUSED:
    "Your session ended for security reasons. Sign in again.",
};

/** Every 401 code that means "the session is over, go to login". */
export const SESSION_OVER_CODES = new Set([
  "REFRESH_TOKEN_MISSING",
  "REFRESH_TOKEN_INVALID",
  "REFRESH_TOKEN_REUSED",
  "SESSION_INVALID",
  "TOKEN_REVOKED",
  "USER_NOT_FOUND",
]);

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

export function errorMessage(error: unknown, fallback = DEFAULT_MESSAGE): string {
  if (!isApiError(error)) return fallback;

  if (error.statusCode === 0) return error.message;

  if (error.code === "RATE_LIMIT_EXCEEDED") {
    return error.retryAfter
      ? `Too many attempts. Try again in ${formatSeconds(error.retryAfter)}.`
      : error.message;
  }

  // The cooldown message names the remaining seconds, so the server's wording
  // beats anything hard-coded here.
  if (error.code === "RESEND_COOLDOWN") return error.message;

  if (error.code && CODE_MESSAGES[error.code]) return CODE_MESSAGES[error.code];

  return error.message || fallback;
}

export function errorCode(error: unknown): string | undefined {
  return isApiError(error) ? error.code : undefined;
}

function formatSeconds(seconds: number) {
  if (seconds < 60) return `${Math.ceil(seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
