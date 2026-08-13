import type { ReactNode } from "react";

import { BrandLogo } from "@/components/layout/brand-logo";
import { UserMenu } from "@/components/auth/user-menu";

/**
 * The shell for sign-in, registration and password screens.
 *
 * Keeps the minimal header these pages have always had - a logo home and the
 * session state - without the storefront's nav, footer and bottom bar. A
 * shopper part-way through signing in should have one way forward and one way
 * out, not a full menu inviting them to wander off.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <BrandLogo className="h-7" />
        <UserMenu />
      </header>
      {children}
    </>
  );
}
