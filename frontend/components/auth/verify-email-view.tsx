"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { FormAlert } from "@/components/auth/form-alert";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authApi, type PendingRegistration, type VerifyEmailResult } from "@/lib/api/auth";
import { errorCode, errorMessage } from "@/lib/auth/errors";

/**
 * The emailed token is single use, and React runs effects twice in
 * development. Keying the in-flight request by token means the second run
 * awaits the first request instead of spending the token again and reporting
 * `VERIFICATION_TOKEN_INVALID` for a link that was perfectly good.
 */
const attempts = new Map<string, Promise<VerifyEmailResult>>();

function verifyOnce(token: string) {
  let attempt = attempts.get(token);
  if (!attempt) {
    attempt = authApi.verifyEmail(token);
    attempts.set(token, attempt);
  }
  return attempt;
}

/** Failures a fresh link can fix. */
const RESENDABLE = new Set([
  "VERIFICATION_TOKEN_INVALID",
  "VERIFICATION_TOKEN_EXPIRED",
]);

type State =
  | { kind: "verifying" }
  | { kind: "signed-in"; message: string }
  | { kind: "password-required"; registration: PendingRegistration }
  | { kind: "failed"; message: string; canResend: boolean };

export function VerifyEmailView({ token }: { token: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<State>(() =>
    token
      ? { kind: "verifying" }
      : {
          kind: "failed",
          message: "This link is missing its token.",
          canResend: true,
        },
  );

  useEffect(() => {
    if (!token) return;

    verifyOnce(token).then(
      (result) => {
        setState(
          result.kind === "password-required"
            ? { kind: "password-required", registration: result.registration }
            : { kind: "signed-in", message: result.message },
        );
      },
      (error: unknown) => {
        setState({
          kind: "failed",
          message: errorMessage(error),
          canResend: RESENDABLE.has(errorCode(error) ?? ""),
        });
      },
    );
  }, [token]);

  // The normal-signup branch is already signed in, so there is nothing left to
  // do on this page.
  useEffect(() => {
    if (state.kind !== "signed-in") return;
    const timer = setTimeout(() => router.replace("/"), 1200);
    return () => clearTimeout(timer);
  }, [state.kind, router]);

  if (state.kind === "verifying") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Confirming your email…
      </div>
    );
  }

  if (state.kind === "signed-in") {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert message={state.message} tone="info" />
        <p className="text-sm text-muted-foreground">
          Your account is ready and you are signed in. Taking you to the store…
        </p>
        <Button onClick={() => router.replace("/")}>Continue</Button>
      </div>
    );
  }

  // The checkout branch: the address is confirmed but there is no account and,
  // deliberately, no session - a forwarded email must not be a sign-in.
  if (state.kind === "password-required") {
    return <SetPasswordForm registration={state.registration} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <FormAlert message={state.message} />

      {state.canResend ? (
        <ResendVerificationForm label="Send a new link" />
      ) : null}

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
