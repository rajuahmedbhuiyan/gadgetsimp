"use client";

/**
 * Password and sessions.
 *
 * The password row is not the same for everyone. An account created through
 * Google or Facebook has no password at all, so offering "change" would send
 * them to a form whose first field they cannot fill; they get "set one"
 * instead, which goes through the emailed-link flow because there is no
 * current password to prove ownership with.
 *
 * Signing out everywhere is destructive enough to confirm - it ends the
 * session doing the asking too, which is not obvious from the label.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { User } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/auth/errors";
import { FormAlert } from "@/components/auth/form-alert";

export function SecurityCard({ user }: { user: User }) {
  const router = useRouter();
  const { logoutAll } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPassword = user.authProviders.includes("EMAIL");

  async function signOutEverywhere() {
    setError(null);
    setBusy(true);
    try {
      await logoutAll();
      // Home rather than the sign-in page: this is the end of a task, which
      // is how the header menu treats a plain sign-out too.
      router.replace("/");
    } catch (signOutError) {
      setError(errorMessage(signOutError));
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
        Security
      </h2>

      {error ? <FormAlert message={error} className="mt-4" /> : null}

      <div className="mt-4 flex flex-col divide-y">
        {/*
          * Only for accounts that have a password. A Google or Facebook
          * account has none to change, and it is not this page's job to talk
          * them into adding one - they already have a way in that works.
          */}
        {hasPassword ? (
          <Row
            icon={KeyRound}
            title="Password"
            description="Changing it signs you out on every device."
          >
            <Button
              variant="outline"
              className="h-10 w-full shrink-0 cursor-pointer rounded-field px-4 text-sm font-medium sm:w-auto"
              render={<Link href="/change-password" />}
            >
              Change
            </Button>
          </Row>
        ) : null}

        <Row
          icon={MonitorSmartphone}
          title="Signed-in devices"
          description="Sign out everywhere if you used a shared or lost device."
        >
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="outline"
                  disabled={busy}
                  className="h-10 w-full shrink-0 cursor-pointer rounded-field px-4 text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
                />
              }
            >
              {busy ? <Spinner /> : <LogOut className="size-4" aria-hidden />}
              Sign out everywhere
            </AlertDialogTrigger>

            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out on every device?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every phone, tablet and browser signed in to this account will
                  be signed out — including this one. Your cart and orders are
                  kept.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="cursor-pointer rounded-field">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={signOutEverywhere}
                  className="cursor-pointer rounded-field bg-destructive text-white hover:bg-destructive/90"
                >
                  Sign out everywhere
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Row>
      </div>
    </section>
  );
}

function Row({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof KeyRound;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}
