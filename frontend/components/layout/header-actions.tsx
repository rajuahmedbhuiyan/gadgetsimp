"use client";

/**
 * The cluster on the right of the header: wishlist, cart, and the account
 * control last.
 *
 * Account sits at the end because it is the one that changes shape - a "Sign
 * in" button when signed out, an avatar when signed in - and a control that
 * resizes is least disruptive at the edge of a row.
 *
 * Client-side because all of it depends on session state: the account control
 * switches on `user`, and the cart badge reads `GET /cart/count`.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Heart,
  LayoutDashboard,
  LogOut,
  Package,
  ShoppingCart,
  User as UserIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { isStaff, roleLabel } from "@/lib/auth/roles";
import { PANEL_ROOT } from "@/lib/panel/access";
import { useCartCount } from "@/hooks/use-cart-count";
import type { User } from "@/lib/api/types";
import { UserAvatar } from "@/components/auth/user-avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function HeaderActions({
  className,
  /** Both hidden on the auth screens - they are ways out of the one task. */
  showWishlist = true,
  showAccount = true,
}: {
  className?: string;
  showWishlist?: boolean;
  showAccount?: boolean;
}) {
  const { user } = useAuth();
  const { count } = useCartCount();

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {showWishlist && (
        <IconLink
          href="/wishlist"
          label="Wishlist"
          className="hidden sm:inline-flex"
        >
          <Heart className="size-5.5" aria-hidden />
        </IconLink>
      )}

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

      {showAccount &&
        (user ? (
          <AccountMenu user={user} />
        ) : (
          <>
            {/* Below `sm` there is no room for a labelled button beside the
                cart, so it becomes an icon in the same shape as its neighbour. */}
            <IconLink href="/login" label="Sign in" className="sm:hidden">
              <UserIcon className="size-5.5" aria-hidden />
            </IconLink>
            <Button
              className="ml-1 hidden h-10 cursor-pointer rounded-field px-4 text-sm font-semibold sm:inline-flex"
              render={<Link href="/login" />}
            >
              Sign in
            </Button>
          </>
        ))}
    </div>
  );
}

/**
 * The signed-in avatar and its panel.
 *
 * A hover card, but the trigger is a real link to `/account` - hover is not an
 * interaction a touch device or a keyboard has, so the panel is a shortcut,
 * never the only way through. Every entry in it is reachable without it; the
 * mobile drawer lists the same ones.
 */
function AccountMenu({ user }: { user: User }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  async function signOut() {
    setOpen(false);
    // Clears the local token even if the call fails.
    await logout();
    // Home, not the sign-in page: signing out is the end of a task, not the
    // start of another one.
    router.replace("/");
  }

  return (
    // Controlled, which is what lets a click open it as well as a hover. Base
    // UI still drives `onOpenChange` for the hover and dismiss behaviour, so
    // mirroring it here keeps all of that and only adds the click.
    <HoverCard open={open} onOpenChange={setOpen}>
      {/* 600ms is Base UI's default, tuned for a link preview you might only
          be passing over. This is a menu the shopper is aiming at, so it opens
          almost immediately - and closes slowly enough to let the pointer
          travel from the avatar down into the panel. */}
      <HoverCardTrigger
        delay={120}
        closeDelay={250}
        render={
          <button
            type="button"
            // A button, not a link to `/account`: the panel already lists
            // "My profile", so navigating on click would skip past the menu
            // the click was meant to open.
            aria-label={`Account — ${user.fullName}`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((shown) => !shown)}
            className="ml-1 flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        }
      >
        <UserAvatar user={user} className="size-8" />
      </HoverCardTrigger>

      <HoverCardContent className="w-64 p-0">
        <div className="flex items-center gap-3 border-b p-4">
          <UserAvatar user={user} className="size-11" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>

        {/* Staff only, and in its own block above the shopper's own links: it
            leaves the shop entirely, which is not what the three below do.
            Hidden for a customer rather than disabled - there is nothing to
            explain to someone who was never meant to see it. */}
        {isStaff(user) && (
          <div className="border-b p-1.5">
            <Link
              href={PANEL_ROOT}
              onClick={close}
              className="flex items-center gap-2.5 rounded-lg bg-brand/10 px-2.5 py-2 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/20 dark:text-brand"
            >
              <LayoutDashboard className="size-4" aria-hidden />
              Dashboard
              {/* Says which door this is - a moderator and an owner see the
                  same button and reach different panels behind it. */}
              <span className="ml-auto text-[11px] font-medium text-muted-foreground">
                {roleLabel(user.role)}
              </span>
            </Link>
          </div>
        )}

        <nav className="p-1.5">
          {/* Closing on click matters for a same-route tap, where there is no
              navigation to unmount the panel. */}
          <MenuLink href="/account" icon={UserIcon} onNavigate={close}>
            My profile
          </MenuLink>
          <MenuLink href="/orders" icon={Package} onNavigate={close}>
            My orders
          </MenuLink>
          <MenuLink href="/wishlist" icon={Heart} onNavigate={close}>
            Wishlist
          </MenuLink>
        </nav>

        <div className="border-t p-1.5">
          <button
            type="button"
            onClick={signOut}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="size-4" aria-hidden />
            Log out
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function MenuLink({
  href,
  icon: Icon,
  onNavigate,
  children,
}: {
  href: string;
  icon: typeof UserIcon;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors hover:bg-muted hover:text-brand-foreground dark:hover:text-brand"
    >
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      {children}
    </Link>
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
              // Anchors the cart badge.
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
