"use client";

/**
 * The panel frame, and the one piece of state the sidebar cannot hold itself.
 *
 * The rail has two ways of being open and they behave differently:
 *
 *  - **Pinned** — the user clicked the trigger (or hit ⌘B). It stays open, and
 *    the choice is written to a cookie so the next page load starts that way.
 *  - **Peeking** — the pointer is over a collapsed rail. It opens for as long
 *    as the pointer is there and closes on the way out, and it is *not*
 *    remembered: a hover is not a preference, and persisting it would mean
 *    passing the mouse over the rail once silently changed how the panel opens
 *    tomorrow.
 *
 * So `open` is `pinned || peeking`, and only a real toggle reaches
 * `SidebarProvider`'s `onOpenChange` - which is what writes the cookie. Hover
 * never goes near it.
 */

import { useState, type ReactNode } from "react";

import type { User } from "@/lib/api/types";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PanelHeader } from "./panel-header";
import { PanelSidebar } from "./panel-sidebar";

export function PanelShell({
  defaultOpen,
  user,
  children,
}: {
  /** The cookie's value, resolved on the server so nothing snaps on load. */
  defaultOpen: boolean;
  user: User;
  children: ReactNode;
}) {
  const [pinned, setPinned] = useState(defaultOpen);
  const [peeking, setPeeking] = useState(false);

  return (
    <SidebarProvider
      open={pinned || peeking}
      // Only the trigger and the keyboard shortcut land here. A click while
      // peeking therefore *pins* what the pointer opened, or closes it - either
      // way it becomes a decision rather than a hover.
      onOpenChange={(next) => {
        setPinned(next);
        setPeeking(false);
      }}
      // Wider than the 3rem default: the collapsed rail holds the only tap
      // target those icons have, and 48px minus padding is not enough of one.
      style={{ "--sidebar-width-icon": "3.5rem" } as React.CSSProperties}
    >
      <a
        href="#panel-main"
        className="sr-only rounded-field bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-100"
      >
        Skip to content
      </a>

      <PanelSidebar
        user={user}
        pinned={pinned}
        onPeekChange={setPeeking}
      />

      <SidebarInset>
        <PanelHeader user={user} />

        {/* `min-w-0` all the way down: without it a wide table stretches the
            flex column and the whole page scrolls sideways instead of the
            table. */}
        <div
          id="panel-main"
          className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:gap-6 sm:p-6"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
