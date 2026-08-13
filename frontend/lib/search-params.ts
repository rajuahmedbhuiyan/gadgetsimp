/** `?a=1&a=2` arrives as an array; every reader here wants one value. */
export function firstParam(
  value: string | string[] | undefined,
): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first ?? null;
}

/**
 * Only same-origin paths, so `?next=` cannot be turned into an open redirect
 * that bounces a signed-in user to someone else's site.
 */
export function safeRedirectPath(
  value: string | string[] | undefined,
  fallback = "/",
) {
  const path = firstParam(value);
  if (!path) return fallback;
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}
