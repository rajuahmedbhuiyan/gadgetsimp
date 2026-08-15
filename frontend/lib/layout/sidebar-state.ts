/**
 * Where the sidebar remembers whether it was expanded.
 *
 * Its own module because two sides need the name: the client sidebar writes
 * the cookie, and the server layout reads it back to render at the right width
 * first time. A server component cannot import it from `components/ui/sidebar`
 * - everything a `"use client"` file exports crosses the boundary as a client
 * reference, string constants included - so the value lives here, out of the
 * way of both.
 */

export const SIDEBAR_COOKIE_NAME = "sidebar_state";

/** A week. Long enough to feel remembered, short enough to forget a one-off. */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
