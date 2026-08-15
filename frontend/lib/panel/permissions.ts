/**
 * What each role may do inside the panel.
 *
 * These mirror the API's own gates rather than adding a second, stricter
 * opinion. Every route under `/products` is `authorize(ROLES.MODERATOR)`, so a
 * moderator genuinely can create, edit and archive a product - hiding those
 * buttons from them would be a lie the API does not tell.
 *
 * None of this is authorisation. The API re-checks the caller's role on every
 * request; this only decides which controls are worth rendering, so a staff
 * member is not handed a button that answers 403.
 *
 * Tightening one of these is a single edit here - but do it on the API first,
 * or the restriction is cosmetic and anyone can step around it with a fetch.
 */

import type { User } from "@/lib/api/types";
import { hasRole } from "@/lib/auth/roles";

export interface ProductPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  /** Archives rather than destroys; the record is kept and hidden. */
  remove: boolean;
}

export function productPermissions(
  user: Pick<User, "role"> | null | undefined,
): ProductPermissions {
  // One gate, matching `router.use(authenticate, authorize(ROLES.MODERATOR))`
  // on the API's product router.
  const staff = hasRole(user, "ROLE_MODERATOR");

  return { view: staff, create: staff, edit: staff, remove: staff };
}
