"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth/auth-context";

/**
 * Leave a signed-out-only page as soon as there is a session.
 *
 * This is also what completes a sign-in: the form awaits the call, the API
 * client stores the session, the context flips to "authenticated", and this
 * effect navigates. One redirect, one place - a form that pushed as well would
 * race this one.
 */
export function useRedirectWhenAuthenticated(target: string) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace(target);
  }, [status, target, router]);
}
