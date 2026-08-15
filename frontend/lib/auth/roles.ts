/**
 * Who outranks whom.
 *
 * The API ranks its four roles and accumulates permissions upward -
 * `ROLE_CUSTOMER` < `ROLE_MODERATOR` < `ROLE_ADMIN` < `ROLE_OWNER` - so an
 * endpoint documented as needing an admin admits an owner too. Every gate here
 * is expressed the same way: as a *minimum*. `hasRole(user, "ROLE_MODERATOR")`
 * lets admins and owners through without naming them, which is what stops a
 * new senior role from having to be added to a dozen allow-lists.
 *
 * None of this is authorisation. The API re-reads the account and re-checks the
 * role on every request; this only decides what the UI bothers to render, and
 * which way to send someone who has walked into a room that is not theirs.
 */

import type { Role, User } from "@/lib/api/types";

const RANK: Record<Role, number> = {
  ROLE_CUSTOMER: 0,
  ROLE_MODERATOR: 1,
  ROLE_ADMIN: 2,
  ROLE_OWNER: 3,
};

/** What each role is called in front of a human. */
export const ROLE_LABEL: Record<Role, string> = {
  ROLE_CUSTOMER: "Customer",
  ROLE_MODERATOR: "Moderator",
  ROLE_ADMIN: "Admin",
  ROLE_OWNER: "Owner",
};

export function roleLabel(role: Role): string {
  return ROLE_LABEL[role] ?? "Customer";
}

/** Does this user rank at or above `minimum`? A signed-out visitor never does. */
export function hasRole(
  user: Pick<User, "role"> | null | undefined,
  minimum: Role,
): boolean {
  if (!user) return false;
  return (RANK[user.role] ?? -1) >= RANK[minimum];
}

/**
 * Anyone who belongs in the control panel: moderators, admins and owners.
 *
 * The panel's floor, and the only check most surfaces need - what a moderator
 * may do *inside* it is decided per route, in `lib/panel/access`.
 */
export function isStaff(user: Pick<User, "role"> | null | undefined): boolean {
  return hasRole(user, "ROLE_MODERATOR");
}
