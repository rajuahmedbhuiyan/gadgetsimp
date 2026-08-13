"use client";

/**
 * The frame every auth screen sits in.
 *
 * A single centred card at one fixed width, whichever screen it is - the
 * register form has five fields and the forgot-password form has one, and a
 * card that resizes per route makes moving between them feel like moving
 * between sites.
 *
 * On a phone the card loses its border and padding and runs to the edges; a
 * 40px frame around a form on a 375px screen is 40px not spent on the inputs.
 *
 * Client-side for the entrance animation. That is safe here in a way it would
 * not be on the storefront: everything inside is a `"use client"` form that
 * does nothing without JavaScript anyway, so nothing is being hidden that
 * would otherwise have worked.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";

import { EASE_BRAND } from "@/lib/motion";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-14">
      {/* A soft brand wash behind the card so the page is not a flat slab. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-32 left-1/2 size-120 -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
      </div>

      <motion.div
        className="relative w-full max-w-md"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE_BRAND }}
      >
        {/* An escape hatch home. The header has one too, but it is a logo -
            this one is unambiguous mid-form. */}
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-1.5 rounded-field py-1 text-sm text-muted-foreground transition-colors hover:text-brand-foreground dark:hover:text-brand"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to home
        </Link>

        <div className="rounded-2xl border-0 bg-transparent p-0 sm:border sm:bg-card sm:p-8 sm:shadow-card">
          <header className="mb-6">
            <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}
          </header>

          {children}
        </div>

        {footer ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}
