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

/* --------------------------------- orders -------------------------------- */

export interface OrderPermissions {
  view: boolean;
  /** Move an order along the workflow. Moderators work the queue. */
  changeStatus: boolean;
  /** Correct the delivery details - name, phone, address, note. */
  edit: boolean;
  /** Soft delete: hides the order, keeps the financial record. */
  remove: boolean;
  /** Permanent delete. Irreversible, and there is nothing to undo it with. */
  destroy: boolean;
}

/**
 * Two gates, not one, because the API has two.
 *
 * `order.admin.routes.js` puts `authorize(ROLES.MODERATOR)` on the router and
 * then raises the bar to `ROLES.ADMIN` on both delete routes individually. So
 * a moderator genuinely works the queue - status changes, address corrections -
 * and removing the record of a sale is a different kind of act, reserved for
 * admins and the owner.
 *
 * `hasRole` is a minimum, so `ROLE_ADMIN` admits the owner without naming
 * them - which is what stops a new senior role from having to be added here.
 */
export function orderPermissions(
  user: Pick<User, "role"> | null | undefined,
): OrderPermissions {
  const staff = hasRole(user, "ROLE_MODERATOR");
  const admin = hasRole(user, "ROLE_ADMIN");

  return {
    view: staff,
    changeStatus: staff,
    edit: staff,
    remove: admin,
    destroy: admin,
  };
}
