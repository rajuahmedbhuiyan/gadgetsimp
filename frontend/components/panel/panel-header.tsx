"use client";

/**
 * The panel's top bar.
 *
 * Sticks to the top of the content column rather than the viewport, so the
 * sidebar rail is never underneath it. Holds the one control that changes
 * meaning with the viewport: below 1024px the trigger opens the drawer, above
 * it collapses the rail to icons.
 *
 * The breadcrumb reads the route rather than being passed down, so a page only
 * has to exist in `lib/panel/nav` to be named correctly here.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { User } from "@/lib/api/types";
import { PANEL_ROOT } from "@/lib/panel/access";
import { activeNavItem } from "@/lib/panel/nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { PanelUserMenu } from "./panel-user-menu";

export function PanelHeader({ user }: { user: User }) {
  const pathname = usePathname();
  const active = activeNavItem(pathname);
  const isRoot = active?.href === PANEL_ROOT;

  return (
    <header className="sticky top-0 z-30 flex h-header shrink-0 items-center gap-2 border-b bg-background/85 px-2 supports-backdrop-filter:bg-background/70 supports-backdrop-filter:backdrop-blur-lg sm:px-4">
      <SidebarTrigger className="size-9" />
      <Separator orientation="vertical" className="mx-1 h-5!" />

      <Breadcrumb>
        <BreadcrumbList>
          {/* The parent crumb is the first thing to drop on a phone: it is one
              tap away in the drawer, and the page's own name is the useful
              half of "Control panel / Orders". */}
          {!isRoot && (
            <>
              <BreadcrumbItem className="hidden sm:block">
                <BreadcrumbLink render={<Link href={PANEL_ROOT} />}>
                  Control panel
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:block" />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium">
              {active?.label ?? "Control panel"}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle className="size-9" />
        <PanelUserMenu user={user} />
      </div>
    </header>
  );
}
