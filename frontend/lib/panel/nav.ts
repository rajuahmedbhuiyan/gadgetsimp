/**
 * The control panel's menu - copy and icons, not behaviour.
 *
 * Permissions are not repeated here: every item takes its minimum role from
 * `PANEL_ACCESS`, the same table `proxy.ts` guards with. One source of truth,
 * so the sidebar can never advertise a page that the guard then bounces.
 *
 * Two groups rather than one flat list. Collapsed to icons the labels vanish
 * and the groups become spacing, which is exactly what a rail needs; expanded,
 * they say why `Variations` sits next to `Attributes`.
 */

import type { LucideIcon } from "lucide-react";
import {
  FolderTree,
  Layers,
  LayoutDashboard,
  Package,
  ReceiptText,
  SlidersHorizontal,
  Tag,
  Users,
} from "lucide-react";

import type { Role, User } from "@/lib/api/types";
import { hasRole } from "@/lib/auth/roles";
import { PANEL_ROOT, requiredRoleFor } from "./access";

export interface PanelNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown in the page header under the title. Keep it to one line. */
  description: string;
}

export interface PanelNavGroup {
  label: string;
  items: PanelNavItem[];
}

export const panelNav: PanelNavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: PANEL_ROOT,
        icon: LayoutDashboard,
        description: "Today's trade at a glance.",
      },
      {
        label: "Orders",
        href: "/admin/orders",
        icon: ReceiptText,
        description: "The queue, from placed to delivered.",
      },
      {
        label: "Users",
        href: "/admin/users",
        icon: Users,
        description: "Accounts, roles and access.",
      },
    ],
  },
  {
    label: "Catalogue",
    items: [
      {
        label: "Products",
        href: "/admin/products",
        icon: Package,
        description: "Everything on the shelves.",
      },
      {
        label: "Variations",
        href: "/admin/variations",
        icon: Layers,
        description: "Colours, sizes and the stock behind them.",
      },
      {
        label: "Categories",
        href: "/admin/categories",
        icon: FolderTree,
        description: "How the shop is organised.",
      },
      {
        label: "Brands",
        href: "/admin/brands",
        icon: Tag,
        description: "Who makes what you sell.",
      },
      {
        label: "Attributes",
        href: "/admin/attributes",
        icon: SlidersHorizontal,
        description: "The specs products are filtered by.",
      },
    ],
  },
];

/** Flat, for lookups. */
export const panelNavItems: PanelNavItem[] = panelNav.flatMap(
  (group) => group.items,
);

/** What this item needs, read from the guard's table rather than duplicated. */
export function minimumRoleFor(item: PanelNavItem): Role {
  return requiredRoleFor(item.href);
}

/**
 * The menu as this user should see it.
 *
 * A group whose every item is out of reach disappears with them, so a
 * moderator never meets an empty heading.
 */
export function navFor(user: Pick<User, "role"> | null): PanelNavGroup[] {
  return panelNav
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasRole(user, minimumRoleFor(item))),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Which menu entry a path belongs to - for the header title and breadcrumb.
 *
 * Longest match wins, and the dashboard is only ever an exact one: it sits at
 * the panel root, so a prefix test would claim every page in the panel.
 */
export function activeNavItem(pathname: string): PanelNavItem | null {
  let match: PanelNavItem | null = null;

  for (const item of panelNavItems) {
    const covers =
      item.href === PANEL_ROOT
        ? pathname === PANEL_ROOT
        : pathname === item.href || pathname.startsWith(`${item.href}/`);

    if (covers && (!match || item.href.length > match.href.length)) {
      match = item;
    }
  }

  return match;
}
