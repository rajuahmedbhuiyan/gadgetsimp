"use client";

/**
 * The control panel's left rail.
 *
 * One component, three presentations, all handled by `SidebarProvider`:
 *
 *  - **≥1024px expanded** — icons and labels, group headings, 16rem wide.
 *  - **≥1024px collapsed** — a rail of icons. The labels do not shrink, they
 *    leave, and each button grows a tooltip so the rail stays usable. Pointing
 *    at it opens it for as long as the pointer stays; see `panel-shell`.
 *  - **<1024px** — no rail at all. The same tree renders inside a sheet that
 *    the header's trigger opens, because a permanent rail on a phone is width
 *    an order table does not get.
 *
 * The menu comes from `lib/panel/nav`, filtered by what this user outranks, so
 * nothing is offered here that the guard in `proxy.ts` would then refuse.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store } from "lucide-react";

import type { User } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { PANEL_ROOT } from "@/lib/panel/access";
import { activeNavItem, navFor } from "@/lib/panel/nav";
import { siteConfig } from "@/lib/config/site";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

/**
 * Shared by every row so the rail reads as one control: 40px tall, 15px type,
 * and - collapsed - a 40px square inside a 56px rail rather than the 32px
 * default, which is under the size a pointer can hit without aiming.
 */
const ROW =
  "h-10 text-[0.9375rem] group-data-[collapsible=icon]:size-10! [&_svg]:size-5";

/**
 * `user` comes down from the layout rather than out of `useAuth()`: the layout
 * has already resolved and vetted it server-side, so the first paint draws the
 * right menu instead of the client context deciding a frame later.
 */
export function PanelSidebar({
  user,
  pinned,
  onPeekChange,
}: {
  user: User;
  /** Open because it was clicked open - so hover must not close it. */
  pinned: boolean;
  onPeekChange: (peeking: boolean) => void;
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const groups = navFor(user);
  const active = activeNavItem(pathname);

  // Already on the dashboard? Then the mark is the way back out to the shop.
  // Clicking it a second time should do something, and this is the only thing
  // it could usefully do.
  const onDashboard = pathname === PANEL_ROOT;
  const brandHref = onDashboard ? "/" : PANEL_ROOT;
  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar
      collapsible="icon"
      // Peek. Guarded on a real mouse - a tap fires `pointerenter` too, and a
      // rail that springs open under a thumb is not what was tapped.
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" && !isMobile && !pinned) {
          onPeekChange(true);
        }
      }}
      onPointerLeave={() => onPeekChange(false)}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={onDashboard ? "Back to the shop" : "Dashboard"}
              className="group-data-[collapsible=icon]:size-10!"
              onClick={closeMobileSidebar}
              render={<Link href={brandHref} />}
            >
              <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-brand font-heading text-sm font-bold tracking-tight text-brand-foreground">
                {brandMark(siteConfig.name)}
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-[0.9375rem] font-semibold">
                  {siteConfig.name}
                </span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  {onDashboard ? "Back to the shop" : "Control panel"}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator className="mx-0" />

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[0.8125rem]">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      // Against the resolved item rather than a prefix test:
                      // the dashboard lives at the panel root, so `startsWith`
                      // would light it up on every page.
                      isActive={active?.href === item.href}
                      tooltip={item.label}
                      // Amber rather than the default gray fill: on a
                      // near-black rail one gray on another is not a state.
                      className={cn(
                        ROW,
                        "data-active:bg-brand/15 data-active:text-brand",
                      )}
                      onClick={closeMobileSidebar}
                      render={<Link href={item.href} />}
                    >
                      <item.icon aria-hidden />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="View the shop"
              className={ROW}
              onClick={closeMobileSidebar}
              render={<Link href="/" />}
            >
              <Store aria-hidden />
              <span>View the shop</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* The hairline between rail and content, draggable to collapse. */}
      <SidebarRail />
    </Sidebar>
  );
}

/**
 * `GadgetSimp` -> `GS`. The square is 32px and the rail collapses to it, so
 * this is the whole logo at that size - one letter is an initial, two are a
 * mark.
 *
 * Read off the capitals so a renamed shop keeps working: `GadgetSimp` gives
 * `GS`, `Acme` falls back to the first two letters (`AC`).
 */
function brandMark(name: string) {
  const capitals = name.match(/\p{Lu}/gu);
  if (capitals && capitals.length >= 2) return capitals.slice(0, 2).join("");
  return name.slice(0, 2).toUpperCase();
}
