/**
 * The shell every home section sits in.
 *
 * One place decides the page gutter, the vertical rhythm and the heading
 * hierarchy, so sections cannot drift apart as they are added. A section
 * supplies an eyebrow, a title, an optional blurb and an optional "see all"
 * link; the layout is not its business.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";

/** The shared horizontal gutter. Used by sections and by the site chrome. */
export const container = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";

export function Section({
  id,
  eyebrow,
  title,
  description,
  href,
  linkLabel = "View all",
  className,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("py-12 lg:py-16", className)}>
      <div className={container}>
        <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8">
          <div className="max-w-2xl">
            {eyebrow && (
              <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold tracking-wide text-brand-foreground uppercase dark:text-brand">
                {eyebrow}
              </span>
            )}
            <h2 className="font-heading text-2xl font-bold tracking-tight text-balance lg:text-3xl">
              {title}
            </h2>
            {description && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground lg:text-base">
                {description}
              </p>
            )}
          </div>

          {href && (
            <Link
              href={href}
              className="group inline-flex shrink-0 items-center gap-1.5 rounded-md text-sm font-semibold text-brand transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              {linkLabel}
              <ArrowRight
                className="size-4 transition-transform duration-200 group-hover:translate-x-1"
                aria-hidden
              />
            </Link>
          )}
        </Reveal>

        {children}
      </div>
    </section>
  );
}

/**
 * What a section renders when the catalogue returns nothing - an empty
 * category, or an API that could not be reached. Never a blank gap, which
 * reads as a broken page.
 */
export function SectionEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-16 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
