"use client";

import { useEffect, useRef, useState } from "react";

import { googleClientId, loadGoogleIdentity } from "@/lib/auth/social";

/**
 * Google's own rendered button.
 *
 * The API wants an **ID token**, and `google.accounts.id` only hands one out
 * through a button it renders itself (or One Tap) - the `oauth2` half of the
 * SDK returns an access token, which this endpoint does not accept.
 */
export function GoogleSignInButton({
  onCredential,
  text = "continue_with",
}: {
  onCredential: (credential: string) => void;
  text?: "signin_with" | "signup_with" | "continue_with";
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  // Keep the handler current without re-initialising the SDK.
  useEffect(() => {
    callback.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const identity = await loadGoogleIdentity();
        if (cancelled || !container.current) return;

        identity.initialize({
          client_id: googleClientId,
          callback: (response) => callback.current(response.credential),
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
        });

        // A remount would otherwise leave two buttons stacked.
        container.current.replaceChildren();
        identity.renderButton(container.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text,
          shape: "rectangular",
          width: 320,
          logo_alignment: "center",
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [text]);

  if (failed) {
    return (
      <p className="text-sm text-muted-foreground">
        Google sign-in is unavailable right now.
      </p>
    );
  }

  return <div ref={container} className="flex justify-center" />;
}
