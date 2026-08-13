"use client";

import { useState } from "react";

import { FacebookSignInButton } from "@/components/auth/facebook-sign-in-button";
import { FormAlert } from "@/components/auth/form-alert";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { FieldSeparator } from "@/components/ui/field";
import { useAuthProviders } from "@/hooks/use-auth-providers";
import type { SocialProviderName } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/auth/errors";
import { isFacebookConfigured, isGoogleConfigured } from "@/lib/auth/social";

/**
 * One endpoint serves every provider and covers both signup and sign-in, so
 * this component is identical on the login and register pages.
 *
 * Which buttons exist is decided by `GET /auth/providers` - the server's own
 * account of what it has configured.
 */
export function SocialSignIn({ label = "Or continue with" }: { label?: string }) {
  const { socialLogin } = useAuth();
  const { supports, isLoading } = useAuthProviders();
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

  const googleEnabled = supports("GOOGLE");
  const facebookEnabled = supports("FACEBOOK");

  if (isLoading || (!googleEnabled && !facebookEnabled)) return null;

  return (
    <div className="mt-6">
      <FieldSeparator>{label}</FieldSeparator>

      {error ? <FormAlert message={error} /> : null}

      <div className="mt-4 flex flex-col gap-3">
        {googleEnabled ? (
          isGoogleConfigured() ? (
            <GoogleSignInButton
              onCredential={(credential) => exchange("GOOGLE", credential)}
            />
          ) : (
            <MissingConfig provider="Google" variable="NEXT_PUBLIC_GOOGLE_CLIENT_ID" />
          )
        ) : null}

        {facebookEnabled ? (
          isFacebookConfigured() ? (
            <FacebookSignInButton
              disabled={pending !== null}
              onToken={(token) => exchange("FACEBOOK", token)}
              onError={setError}
            />
          ) : (
            <MissingConfig provider="Facebook" variable="NEXT_PUBLIC_FACEBOOK_APP_ID" />
          )
        ) : null}
      </div>
    </div>
  );
}

/** The server offers the provider but this build has no client credential. */
function MissingConfig({
  provider,
  variable,
}: {
  provider: string;
  variable: string;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {provider} sign-in is enabled on the API but{" "}
      <code className="font-mono text-xs">{variable}</code> is not set in this
      app.
    </p>
  );
}
