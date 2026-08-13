"use client";

/**
 * Google and Facebook, on both the sign-in and the register page.
 *
 * One endpoint serves every provider and covers both signup and sign-in, so
 * this component is identical on either page.
 *
 * Both buttons are rendered unconditionally rather than asked for. The old
 * `GET /auth/providers` round trip only bought the ability to hide a button
 * the deployment had already decided to ship, and it cost a request plus a
 * placeholder on every visit to a form the shopper wanted to fill in now.
 *
 * The one thing still checked is whether this build has the client credential
 * for each provider - without it the SDK cannot mint a token, so the button
 * would fail on click rather than simply be absent.
 */

import { useState } from "react";

import { FacebookSignInButton } from "@/components/auth/facebook-sign-in-button";
import { FormAlert } from "@/components/auth/form-alert";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import type { SocialProviderName } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/auth/errors";
import { isFacebookConfigured, isGoogleConfigured } from "@/lib/auth/social";

export function SocialSignIn({ label = "Or continue with" }: { label?: string }) {
  const { socialLogin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<SocialProviderName | null>(null);

  async function exchange(type: SocialProviderName, token: string) {
    setError(null);
    setPending(type);
    try {
      // The session lands in the API client, the context notices, and the
      // page's redirect effect does the navigating.
      await socialLogin(type, token);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(null);
    }
  }

  const google = isGoogleConfigured();
  const facebook = isFacebookConfigured();

  // Neither credential set - most likely a build with no env file.
  if (!google && !facebook) return null;

  return (
    <div className="mt-6">
      {/* A rule with the label sitting in a gap in it, rather than a bordered
          heading - this is a divider between two ways in, not a section. */}
      <div className="mb-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {error ? <FormAlert message={error} /> : null}

      <div className="flex flex-col gap-3">
        {google ? (
          <GoogleSignInButton
            onCredential={(credential) => exchange("GOOGLE", credential)}
          />
        ) : (
          <MissingConfig
            provider="Google"
            variable="NEXT_PUBLIC_GOOGLE_CLIENT_ID"
          />
        )}

        {facebook ? (
          <FacebookSignInButton
            disabled={pending !== null}
            onToken={(token) => exchange("FACEBOOK", token)}
            onError={setError}
          />
        ) : (
          <MissingConfig
            provider="Facebook"
            variable="NEXT_PUBLIC_FACEBOOK_APP_ID"
          />
        )}
      </div>
    </div>
  );
}

/** This build has no client credential for the provider. */
function MissingConfig({
  provider,
  variable,
}: {
  provider: string;
  variable: string;
}) {
  return (
    <p className="rounded-field border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
      {provider} sign-in needs <code className="font-mono">{variable}</code> set
      in this app.
    </p>
  );
}
