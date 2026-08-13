"use client";

/**
 * `false` during the server render and the first client pass, `true` after.
 *
 * For values the server cannot know — a stored theme, a local timezone — where
 * rendering the real thing before hydration would mismatch the HTML.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: React reads the
 * server snapshot while hydrating and the client one afterwards, so the flip
 * happens as part of hydration instead of as a second render pass triggered by
 * an effect.
 */

import { useSyncExternalStore } from "react";

/** Nothing to subscribe to - the value changes exactly once, at hydration. */
const subscribe = () => () => {};

export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
