"use client";

/**
 * The sticky shell around the header.
 *
 * Split out from `SiteHeader` so the scroll listener is the only thing that
 * has to be a client component — the logo, search form and nav markup stay on
 * the server and arrive in the HTML.
 *
 * At rest the header is flush with the page; once scrolled it picks up a
 * border, a shadow and a translucent background, which is what separates it
 * from the content sliding underneath.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useScrolled } from "@/hooks/use-scrolled";

export function StickyHeader({ children }: { children: ReactNode }) {
  const scrolled = useScrolled();

  return (
    <header
      data-scrolled={scrolled || undefined}
      className={cn(
        "sticky top-0 z-40 w-full transition-[background-color,box-shadow,border-color] duration-300",
        scrolled
          ? "border-b bg-background/80 shadow-chrome supports-backdrop-filter:bg-background/65 supports-backdrop-filter:backdrop-blur-lg"
          : "border-b border-transparent bg-background",
      )}
    >
      {children}
    </header>
  );
}
