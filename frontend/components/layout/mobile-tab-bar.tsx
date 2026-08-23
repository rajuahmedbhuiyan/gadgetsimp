"use client";

/**
 * The fixed bottom bar below 1024px.
 *
 * Home, Shop, Cart, Profile — the four destinations a shopper returns to, kept
 * within thumb reach instead of behind the hamburger at the top of the screen.
 * Hidden from `lg` up, where the header already shows all four.
 *
 * `pb-[env(safe-area-inset-bottom)]` keeps the row clear of the iOS home
 * indicator; the matching offset on `<main>` in the layout stops the bar from
 * covering the last of the page.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { hasMobileTabChrome } from "@/lib/layout/chrome";
import { mobileTabs } from "@/lib/config/site";
import { useAuth } from "@/lib/auth/auth-context";
import { useCartCount } from "@/hooks/use-cart-count";
import { transitions } from "@/lib/motion";

export function MobileTabBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { count } = useCartCount();

  if (!hasMobileTabChrome(pathname)) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] supports-backdrop-filter:bg-background/75 supports-backdrop-filter:backdrop-blur-lg lg:hidden"
    >
      <ul className="mx-auto flex h-tabbar max-w-lg items-stretch">
        {mobileTabs.map(({ label, href, icon: Icon, badge }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          // Sending a guest to /account lands them on a redirect; point them
          // straight at sign-in instead.
          const target = href === "/account" && !user ? "/login" : href;
          const showBadge = badge === "cart" && count > 0;

          return (
            <li key={label} className="flex-1">
              <Link
                href={target}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active
                    ? "text-brand"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tab-indicator"
                    className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-brand"
                    transition={transitions.spring}
                  />
                )}

                <span className="relative">
                  <Icon className="size-6" aria-hidden />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-2 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-4 font-bold text-brand-foreground tabular-nums">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </span>

                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
