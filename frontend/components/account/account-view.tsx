"use client";

/**
 * The account hub.
 *
 * Signed-in only, and unlike the cart there is no guest equivalent worth
 * offering - a profile is the account.
 *
 * What is here is bounded by what the API actually supports for a customer:
 * name, phone and picture through `PATCH /users/me`, the password through the
 * auth routes, and nothing else. In particular there is no saved-address book,
 * because addresses live on an order rather than on a user - checkout asks
 * each time, and inventing a stored one here would be a promise the server
 * cannot keep.
 */

import Link from "next/link";
import { motion } from "motion/react";
import {
  BadgeCheck,
  ChevronRight,
  Heart,
  MailWarning,
  Package,
  ShoppingBag,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { EASE_BRAND } from "@/lib/motion";
import type { AuthProviderName, User } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import { SignedOutPrompt } from "@/components/auth/signed-out-prompt";
import { AvatarUploader } from "./avatar-uploader";
import { ProfileForm } from "./profile-form";
import { SecurityCard } from "./security-card";

const SHORTCUTS = [
  {
    href: "/orders",
    icon: Package,
    title: "My orders",
    description: "Track a delivery or look back at a purchase",
  },
  {
    href: "/wishlist",
    icon: Heart,
    title: "Wishlist",
    description: "Everything you saved for later",
  },
  {
    href: "/shop",
    icon: ShoppingBag,
    title: "Keep shopping",
    description: "Browse the full catalogue",
  },
];

export function AccountView() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <AccountSkeleton />;

  if (!user) {
    return (
      <SignedOutPrompt
        title="Sign in to your account"
        description="Your profile, orders and saved items live behind your account."
        next="/account"
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_BRAND }}
      className="flex flex-col gap-6"
    >
      <ProfileHeader user={user} />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <section className="rounded-xl border bg-card p-5 sm:p-6">
          <h2 className="mb-5 text-sm font-semibold">Your details</h2>
          <ProfileForm user={user} />
        </section>

        <div className="flex flex-col gap-6">
          <SecurityCard user={user} />
          <SignInMethods providers={user.authProviders} />
          <Shortcuts />
        </div>
      </div>
    </motion.div>
  );
}

function ProfileHeader({ user }: { user: User }) {
  return (
    <section className="relative overflow-hidden rounded-xl border bg-card">
      {/* A brand wash behind the avatar, so the top of the page is not four
          identical grey cards stacked up. */}
      <div
        aria-hidden
        className="h-20 bg-linear-to-r from-brand/25 via-brand/10 to-transparent sm:h-24"
      />

      <div className="flex flex-col items-center gap-4 px-5 pb-5 text-center sm:flex-row sm:items-end sm:gap-5 sm:px-6 sm:pb-6 sm:text-left">
        {/* Pulled up so it straddles the wash and the card below it. */}
        <div className="-mt-12 sm:-mt-14">
          <AvatarUploader user={user} />
        </div>

        <div className="min-w-0 flex-1 sm:pb-6">
          <h2 className="truncate font-heading text-xl font-bold tracking-tight sm:text-2xl">
            {user.fullName}
          </h2>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>

          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {user.emailVerifiedAt ? (
              <Pill tone="success" icon={BadgeCheck}>
                Verified
              </Pill>
            ) : (
              <Pill tone="warning" icon={MailWarning}>
                Email not verified
              </Pill>
            )}
            <span className="text-xs text-muted-foreground">
              Member since {memberSince(user.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

const PROVIDER_LABELS: Record<AuthProviderName, string> = {
  EMAIL: "Email and password",
  GOOGLE: "Google",
  FACEBOOK: "Facebook",
};

/**
 * How this account signs in - only the methods it actually has.
 *
 * The earlier version listed all three with a "Not connected" state, which
 * was wrong twice over: there is no endpoint to link or unlink a provider, so
 * the empty rows advertised something the page cannot do, and they made a
 * one-method account look half-configured.
 *
 * Usually one row. It is not always one: signing in with Google using the
 * address of an existing email account adds the provider to that same
 * account, and setting a password on a social-only account adds `EMAIL`. So
 * this renders what the record says rather than assuming a single method.
 */
function SignInMethods({ providers }: { providers: AuthProviderName[] }) {
  if (providers.length === 0) return null;

  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="text-sm font-semibold">How you sign in</h2>
      <ul className="mt-4 flex flex-col gap-2.5">
        {providers.map((provider) => (
          <li
            key={provider}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="font-medium">{PROVIDER_LABELS[provider]}</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
              <BadgeCheck className="size-3.5" aria-hidden />
              Connected
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Shortcuts() {
  return (
    <nav aria-label="Account shortcuts" className="rounded-xl border bg-card p-1.5">
      <ul>
        {SHORTCUTS.map((shortcut) => (
          <li key={shortcut.href}>
            <Link
              href={shortcut.href}
              className="group flex items-center gap-3 rounded-lg px-3.5 py-3 transition-colors hover:bg-muted"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/12 text-brand-foreground dark:text-brand">
                <shortcut.icon className="size-4.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {shortcut.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {shortcut.description}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Pill({
  tone,
  icon: Icon,
  children,
}: {
  tone: "success" | "warning";
  icon: typeof BadgeCheck;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "success"
          ? "bg-success/12 text-success"
          : "bg-warning/15 text-warning-foreground dark:text-warning",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

/** `March 2026` - a join date does not need a day. */
function memberSince(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function AccountSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-44 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <Skeleton className="h-96 w-full rounded-xl" />
        <div className="flex flex-col gap-6">
          <Skeleton className="h-52 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
