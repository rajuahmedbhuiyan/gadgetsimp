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
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { useScrolled } from "@/hooks/use-scrolled";
import { hasBareChrome } from "@/lib/layout/chrome";

export function StickyHeader({ children }: { children: ReactNode }) {
  const scrolled = useScrolled();
  const pathname = usePathname();

  /*
   * The shop scrolls past its header instead of under it. Its filter sidebar
   * is the thing that sticks there, and two stacked sticky elements leave the
   * grid working through a permanently shortened viewport - which the
   * window-scroll virtualisation then has to measure around.
   */
  const bare = hasBareChrome(pathname);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className={cn(
        "z-40 w-full transition-[background-color,box-shadow,border-color] duration-300",
        bare ? "relative border-b bg-background" : "sticky top-0",
        !bare &&
          (scrolled
            ? "border-b bg-background/80 shadow-chrome supports-backdrop-filter:bg-background/65 supports-backdrop-filter:backdrop-blur-lg"
            : "border-b border-transparent bg-background"),
      )}
    >
      {children}
    </header>
  );
}
