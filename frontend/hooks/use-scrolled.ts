"use client";

/**
 * Whether the page has scrolled past a threshold.
 *
 * Drives the header's condensed state. Reads are passive and coalesced into an
 * animation frame so a fast scroll does not run a React update per event.
 */

import { useEffect, useState } from "react";

export function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrolled(window.scrollY > threshold);
      });
    };

    // A refresh can restore a scroll position, so settle the state up front
    // rather than waiting for the first scroll event.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return scrolled;
}
