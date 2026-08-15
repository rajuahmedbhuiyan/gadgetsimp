"use client";

/**
 * The signed-in member of staff, top right.
 *
 * Shows the role because in a panel it matters: a moderator who cannot see why
 * a control is missing at least knows what they are signed in as. The badge is
 * display only - the API decides what the account may actually do.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut, Store, UserRound } from "lucide-react";

import type { User } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { roleLabel } from "@/lib/auth/roles";
import { UserAvatar } from "@/components/auth/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function PanelUserMenu({ user }: { user: User }) {
  const { logout } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      // Clears the local token even if the call itself fails.
      await logout();
      router.replace("/login?notice=signed-out");
    } finally {
      setPending(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-9 cursor-pointer gap-2 px-1.5 sm:pr-2.5"
            aria-label="Account menu"
          />
        }
      >
        <UserAvatar user={user} className="size-7" />
        {/* The name is the first thing to go when the header gets tight - the
            avatar still identifies the account. */}
        <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">
          {user.fullName}
        </span>
        <ChevronsUpDown className="hidden size-3.5 text-muted-foreground sm:block" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60 p-1.5">
        <div className="flex items-center gap-2.5 px-1.5 py-1.5">
          <UserAvatar user={user} className="size-9" />
          <div className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-sm font-medium">
              {user.fullName}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          </div>
        </div>

        <div className="px-1.5 pb-1.5">
          <Badge variant="secondary">{roleLabel(user.role)}</Badge>
        </div>

        <DropdownMenuSeparator />

        {/* `cursor-pointer` on every row: the shared menu item ships with
            `cursor-default`, which is the desktop-menu convention and wrong
            for rows that are links. */}
        <DropdownMenuItem
          className="cursor-pointer px-2 py-1.5"
          render={<Link href="/account" />}
        >
          <UserRound aria-hidden />
          My profile
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer px-2 py-1.5"
          render={<Link href="/" />}
        >
          <Store aria-hidden />
          View the shop
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onClick={signOut}
          className="cursor-pointer px-2 py-1.5"
        >
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
