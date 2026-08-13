/**
 * Motion tokens.
 *
 * The same three gestures carry the whole storefront - rise, fade, and a small
 * scale on press - so they are defined once and imported rather than retyped
 * per component. Durations sit between 0.35s and 0.6s: long enough to read as
 * deliberate, short enough that a shopper scrolling fast never waits on one.
 *
 * Reduced motion is handled globally by `<MotionConfig reducedMotion="user">`
 * in `app/providers.tsx`, so nothing here needs to branch on it.
 */

import type { Transition, Variants } from "motion/react";

/** Matches `--ease-brand` in globals.css, so CSS and JS motion agree. */
export const EASE_BRAND = [0.22, 1, 0.36, 1] as const;

export const transitions = {
  fast: { duration: 0.25, ease: EASE_BRAND },
  base: { duration: 0.45, ease: EASE_BRAND },
  slow: { duration: 0.7, ease: EASE_BRAND },
  spring: { type: "spring", stiffness: 380, damping: 30 },
} satisfies Record<string, Transition>;

/** The default entrance: rise a little while fading in. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: transitions.base },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: transitions.base },
};

/**
 * A list whose children arrive in sequence.
 *
 * `staggerChildren` is deliberately small - a 12-tile category grid at 0.1s
 * would take 1.2s to finish, which is a stutter rather than a flourish.
 */
export function staggerContainer(stagger = 0.05, delay = 0): Variants {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: stagger, delayChildren: delay },
    },
  };
}

/**
 * Shared `whileInView` settings.
 *
 * `amount: 0` - fire as soon as any part of the element crosses the viewport -
 * is not a stylistic choice, it is the only threshold that is safe on a
 * container taller than the screen. A fractional threshold is a fraction of
 * the *element*, so a 30-card grid on a phone can never expose 15% of itself
 * at once: the observer never fires, the container never leaves `hidden`, and
 * every product inside it stays at `opacity: 0`.
 */
export const inViewOnce = {
  once: true,
  amount: 0,
} as const;
