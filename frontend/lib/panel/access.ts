/**
 * Which role each control-panel route needs.
 *
 * Deliberately free of React and icons: `proxy.ts` imports this to turn a
 * request away before anything renders, and middleware should not be dragging
 * a component library into its bundle to find out that `/admin/users` wants an
 * admin. The menu (`lib/panel/nav`) reads the same table for its labels and
 * icons, so the sidebar cannot offer a link the guard will then refuse.
 *
 * Add a route here first. Anything under `PANEL_ROOT` that is not listed still
 * requires staff - `DEFAULT_MINIMUM` - so a page can never ship wide open by
 * being forgotten.
 */

import type { Role } from "@/lib/api/types";

/** Every panel route hangs off this. The storefront owns everything else. */
export const PANEL_ROOT = "/admin";

/** The floor for the panel as a whole: moderators, admins and owners. */
const DEFAULT_MINIMUM: Role = "ROLE_MODERATOR";

/**
 * Route -> the lowest role that may open it.
 *
 * Matched by longest prefix, so `/admin/orders/1042` inherits what
 * `/admin/orders` requires and detail pages need no entry of their own.
 *
 * They all sit at `ROLE_MODERATOR` for now, which is what the panel was asked
 * for. Tightening one is a single edit here - `/admin/users` is the obvious
 * first candidate, since `GET /users` is admin-and-above on the API and a
 * moderator would only meet a 403 - and both the guard and the menu follow.
 */
export const PANEL_ACCESS: Record<string, Role> = {
  "/admin": "ROLE_MODERATOR",
  "/admin/orders": "ROLE_MODERATOR",
  "/admin/users": "ROLE_MODERATOR",
  "/admin/products": "ROLE_MODERATOR",
  "/admin/variations": "ROLE_ADMIN",
  "/admin/categories": "ROLE_ADMIN",
  "/admin/brands": "ROLE_MODERATOR",
  "/admin/attributes": "ROLE_ADMIN",
};

/** `/admin`, `/admin/orders/12` - but not `/administrators`. */
export function isPanelPath(pathname: string): boolean {
  return pathname === PANEL_ROOT || pathname.startsWith(`${PANEL_ROOT}/`);
}

/**
 * The minimum role for a path, by longest matching prefix.
 *
 * `/admin/orders/1042/edit` -> whatever `/admin/orders` requires. An unlisted
 * path under the panel falls back to the panel floor rather than to nothing.
 */
export function requiredRoleFor(pathname: string): Role {
  let match: Role | null = null;
  let matchedLength = -1;

  for (const [route, role] of Object.entries(PANEL_ACCESS)) {
    const covers = pathname === route || pathname.startsWith(`${route}/`);
    if (covers && route.length > matchedLength) {
      match = role;
      matchedLength = route.length;
    }
  }

  return match ?? DEFAULT_MINIMUM;
}
