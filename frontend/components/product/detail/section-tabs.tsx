"use client";

/**
 * Anchor tabs for the sections below the fold.
 *
 * Not a tab panel: both sections stay rendered and a normal scroll walks
 * through them, which is what you want on a product page - a shopper scrolling
 * for the description should not have to discover that it is hidden behind a
 * tab. Clicking a tab jumps to that section, and the highlight follows
 * whichever one is on screen.
 *
 * The observer's `rootMargin` shrinks the viewport to a band across the upper
 * third, so "active" means "the section the reader is looking at" rather than
 * "any section touching the viewport" - otherwise two tabs light up at once on
 * a tall screen.
 */

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export interface PageSection {
  id: string;
  label: string;
}

export function SectionTabs({ sections }: { sections: PageSection[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const onScreen = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];

        if (onScreen) setActiveId(onScreen.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );

    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [sections]);

  return (
    // Sticks under the site header, which is why the offset is the header
    // token rather than a literal.
    <div className="sticky top-header z-20 -mx-4 mb-8 border-b bg-background/90 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <nav aria-label="Product sections">
        <ul className="flex gap-6 overflow-x-auto scrollbar-none">
          {sections.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                aria-current={activeId === section.id}
                onClick={() => {
                  // `scroll-mt` on the target keeps it clear of the header;
                  // `scrollIntoView` honours it.
                  document
                    .getElementById(section.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  setActiveId(section.id);
                }}
                className={cn(
                  "relative cursor-pointer whitespace-nowrap py-3 text-sm font-medium transition-colors",
                  "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
                  activeId === section.id
                    ? "text-foreground after:bg-brand"
                    : "text-muted-foreground after:bg-transparent hover:text-foreground",
                )}
              >
                {section.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
