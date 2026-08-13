/**
 * The storefront header.
 *
 * Two different structures either side of 1024px, not one structure that
 * shrinks:
 *
 *  - **≥1024px** — logo, a wide search field, and the action icons on one row,
 *    with the main menu on a second row below it. Room for hover panels.
 *  - **<1024px** — hamburger, logo, cart. The menu moves into a drawer and the
 *    search drops to its own row, because a 375px viewport cannot hold a
 *    usable search field and five nav items at once.
 *
 * A server component: only the parts that need state (`StickyHeader`,
 * `DesktopNav`, `MobileNav`, `HeaderActions`, `SearchBar`) cross into the
 * client, and they are composed here rather than nesting the whole tree in a
 * `"use client"` file.
 */

import { BrandLogo } from "./brand-logo";
import { DesktopNav } from "./desktop-nav";
import { HeaderActions } from "./header-actions";
import { MobileNav } from "./mobile-nav";
import { SearchBar } from "./search-bar";
import { StickyHeader } from "./sticky-header";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <StickyHeader>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-header items-center gap-3 lg:gap-6">
          <div className="lg:hidden">
            <MobileNav />
          </div>

          <BrandLogo priority />

          <SearchBar className="mx-auto hidden max-w-xl lg:block" />

          <div className="ml-auto flex items-center gap-1 lg:ml-0">
            <ThemeToggle className="hidden sm:inline-flex" />
            <HeaderActions />
          </div>
        </div>

        {/* Second row, desktop only: the menu gets its own line so the search
            field above it can stay full width. */}
        <div className="hidden h-12 items-center justify-between border-t lg:flex">
          <DesktopNav />
          <p className="text-xs text-muted-foreground">
            Cash on delivery · 7 day returns
          </p>
        </div>
      </div>

      {/* Search moves below the logo row on small screens rather than competing
          with it for horizontal space. */}
      <div className="border-t px-4 py-2.5 sm:px-6 lg:hidden">
        <SearchBar />
      </div>
    </StickyHeader>
  );
}
