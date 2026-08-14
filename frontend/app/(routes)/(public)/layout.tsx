import type { ReactNode } from "react";

import { GuestCartMerge } from "@/components/cart/guest-cart-merge";
import { SiteHeader } from "@/components/layout/site-header";

/**
 * The shell for sign-in, registration and password screens.
 *
 * The storefront navbar minus the two controls that would pull a shopper out
 * of the one task they are on: the wishlist and the account button. The logo,
 * search, the category menu and the cart stay, and the logo is still a link
 * home.
 *
 * No footer and no bottom tab bar: `AuthShell` already fills the viewport, and
 * a fixed bar at the bottom sits exactly where the submit button wants to be.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-field bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-100"
      >
        Skip to content
      </a>

      <SiteHeader variant="auth" />

      {/* Signing in happens here, so this is where a guest cart is handed over. */}
      <GuestCartMerge />

      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </>
  );
}
