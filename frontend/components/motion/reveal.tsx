"use client";

/**
 * Scroll-entrance wrappers.
 *
 * These are the only client components in the animation path. Everything they
 * wrap arrives as `children`, so a server-rendered product card stays a server
 * component and still animates - the boundary is the wrapper, not the content.
 *
 * Use `<Reveal>` for a single block and `<Stagger>` + `<StaggerItem>` for a
 * grid or list, where children should arrive in sequence rather than together.
 */

import type { ReactNode } from "react";
import { motion, type Variants } from "motion/react";

import { fadeUp, inViewOnce, staggerContainer } from "@/lib/motion";

/**
 * The elements these wrappers can render as.
 *
 * A fixed map rather than `motion.create(as)`: creating a component during
 * render returns a new type every pass, which remounts the subtree instead of
 * updating it. Listing the handful of tags actually needed keeps every one of
 * them a stable module-level component - and makes `as` type-checked, so a
 * `<Stagger as="ul">` cannot be given a child that is not an `li`.
 */
const motionTags = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
  ul: motion.ul,
  ol: motion.ol,
  li: motion.li,
  nav: motion.nav,
  dl: motion.dl,
  span: motion.span,
} as const;

export type MotionTag = keyof typeof motionTags;

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Seconds to wait before starting - for hero copy arriving in order. */
  delay?: number;
  variants?: Variants;
  as?: MotionTag;
  /** Forwarded so a semantic wrapper can still be labelled. */
  "aria-label"?: string;
}

export function Reveal({
  children,
  className,
  delay = 0,
  variants = fadeUp,
  as = "div",
  ...rest
}: RevealProps) {
  const Component = motionTags[as];

  return (
    <Component
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={inViewOnce}
      variants={variants}
      transition={{ delay }}
      {...rest}
    >
      {children}
    </Component>
  );
}

interface StaggerProps {
  children: ReactNode;
  className?: string;
  /** Seconds between each child. Keep small on long lists. */
  stagger?: number;
  delay?: number;
  as?: MotionTag;
  "aria-label"?: string;
}

export function Stagger({
  children,
  className,
  stagger = 0.05,
  delay = 0,
  as = "div",
  ...rest
}: StaggerProps) {
  const Component = motionTags[as];

  return (
    <Component
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={inViewOnce}
      variants={staggerContainer(stagger, delay)}
      {...rest}
    >
      {children}
    </Component>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  variants?: Variants;
  as?: MotionTag;
  "aria-label"?: string;
}

/**
 * A child of `<Stagger>`. It carries no `initial`/`whileInView` of its own -
 * the parent drives it through the shared `hidden`/`visible` variant names.
 */
export function StaggerItem({
  children,
  className,
  variants = fadeUp,
  as = "div",
  ...rest
}: StaggerItemProps) {
  const Component = motionTags[as];

  return (
    <Component className={className} variants={variants} {...rest}>
      {children}
    </Component>
  );
}
