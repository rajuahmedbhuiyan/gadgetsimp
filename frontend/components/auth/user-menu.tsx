"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * The session, wherever the app shell wants it. Deliberately plain.
 *
 * Nothing here decides what the user may *do* - `user.role` is display only,
 * and the server re-reads the account on every request regardless.
 */
export function UserMenu() {
  const { user, status, logout, logoutAll } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut(everywhere: boolean) {
    setPending(true);
    try {
      // Both clear the local token even if the call fails.
      await (everywhere ? logoutAll() : logout());
      router.replace("/login?notice=signed-out");
    } finally {
      setPending(false);
    }
  }

  // Hold the space until the boot refresh settles, so the signed-out state
  // does not flash before the signed-in one.
  if (status === "loading") {
    return <Spinner className="text-muted-foreground" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/login" />}>
          Sign in
        </Button>
        <Button size="sm" render={<Link href="/register" />}>
          Create account
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">{user.fullName}</span>
      <Link href="/change-password" className="underline underline-offset-4">
        Password
      </Link>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => signOut(false)}
      >
        Sign out
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => signOut(true)}
      >
        Sign out everywhere
      </Button>
    </div>
  );
}
