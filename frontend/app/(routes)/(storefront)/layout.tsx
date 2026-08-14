import type { ReactNode } from "react";

import { GuestCartMerge } from "@/components/cart/guest-cart-merge";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { TopBar } from "@/components/layout/top-bar";
import { WhatsAppFab } from "@/components/layout/whatsapp-fab";

/**
 * The shop chrome: top bar, header, footer, the fixed tab bar below 1024px,
 * and the floating WhatsApp button.
 *
 * A route group rather than a path segment, so these pages keep their URLs
 * (`/`, `/shop`, `/cart`) while auth and checkout screens can sit in a sibling
 * group with no storefront chrome at all.
 */
export default function StorefrontLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-100"
      >
        Skip to content
      </a>

      <TopBar />
      <SiteHeader />

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter />
      <MobileTabBar />
      <WhatsAppFab />

      {/* Renders nothing; moves a guest cart onto the account at sign-in. */}
      <GuestCartMerge />
    </>
  );
}
