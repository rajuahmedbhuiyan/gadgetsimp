import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { PanelShell } from "@/components/panel/panel-shell";
import { isStaff } from "@/lib/auth/roles";
import { decodeUserHeader, USER_HEADER } from "@/lib/auth/user-header";
import { SIDEBAR_COOKIE_NAME } from "@/lib/layout/sidebar-state";
import { PANEL_ROOT } from "@/lib/panel/access";

export const metadata: Metadata = {
  title: {
    default: "Control panel",
    // Pages below supply their own name: "Orders · Control panel".
    template: "%s · Control panel",
  },
  // Staff-only and behind a session. Nothing here should ever be indexed, and
  // a crawler that follows a link into it should not follow anything out.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The control panel shell.
 *
 * Its own route group, so it inherits the document from the root layout and
 * none of the storefront's chrome - no promotional top bar, no footer, no
 * bottom tab bar competing with a data table.
 *
 * **The guard here is the second of two.** `proxy.ts` already turned away
 * anyone who is not staff, before this rendered. This repeats the check
 * because a layout that trusts an upstream redirect is one routing change away
 * from being wide open, and the cost is a header read. Neither is
 * authorisation: the API re-checks the caller's role on every call the panel
 * makes, so the worst a forged path could reach is an empty screen.
 */
export default async function PanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);

  // Resolved by middleware against `/users/me`, not read from a token claim.
  const user = decodeUserHeader(headerList.get(USER_HEADER));

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(PANEL_ROOT)}`);
  }

  if (!isStaff(user)) {
    redirect("/");
  }

  // The rail's last state, so a collapsed sidebar renders collapsed rather
  // than expanding for a frame and snapping shut when the client takes over.
  const defaultOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value !== "false";

  return (
    <PanelShell defaultOpen={defaultOpen} user={user}>
      {children}
    </PanelShell>
  );
}
