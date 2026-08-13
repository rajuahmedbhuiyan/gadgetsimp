"use client";

/**
 * The icon cluster on the right of the header: wishlist, account, cart.
 *
 * Client-side because two of the three depend on session state — the account
 * button changes label and destination once signed in, and the cart badge
 * reads `GET /cart/count`. The counts animate on change so an "added to cart"
 * from anywhere in the app is visible in the corner of the eye.
 */

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Heart, ShoppingCart, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { useCartCount } from "@/hooks/use-cart-count";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function HeaderActions({ className }: { className?: string }) {
  const { user } = useAuth();
  const { count } = useCartCount();

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <IconLink
        href="/wishlist"
        label="Wishlist"
        className="hidden sm:inline-flex"
      >
        <Heart className="size-5.5" aria-hidden />
      </IconLink>

      <IconLink
        href={user ? "/account" : "/login"}
        label={user ? `Account — ${user.fullName}` : "Sign in"}
        className="hidden lg:inline-flex"
      >
        <User className="size-5.5" aria-hidden />
      </IconLink>

      <IconLink href="/cart" label={`Cart — ${count} items`}>
        <ShoppingCart className="size-5.5" aria-hidden />
        <AnimatePresence>
          {count > 0 && (
            <motion.span
              // Re-keying on the value replays the pop each time it changes.
              key={count}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
              className="absolute top-1 right-1 flex min-w-4.5 items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-4 font-bold text-brand-foreground tabular-nums"
            >
              {count > 99 ? "99+" : count}
            </motion.span>
          )}
        </AnimatePresence>
      </IconLink>
    </div>
  );
}

function IconLink({
  href,
  label,
  className,
  children,
}: {
  href: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      {/* The trigger *is* the link. Styling comes from `buttonVariants` rather
          than nesting a Button, so this stays a real anchor - middle-click,
          "open in new tab" and Next's prefetch all keep working. */}
      <TooltipTrigger
        render={
          <Link
            href={href}
            aria-label={label}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-lg" }),
              // Anchors the cart badge. `size-11` overrides the variant's
              // `size-9` so the glyph has room to breathe.
              "relative size-11 cursor-pointer rounded-full",
              className,
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
