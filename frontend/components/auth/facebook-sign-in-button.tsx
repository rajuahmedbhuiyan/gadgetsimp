"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  facebookLogin,
  loadFacebookSdk,
  SocialCancelledError,
} from "@/lib/auth/social";

export function FacebookSignInButton({
  onToken,
  onError,
  disabled,
}: {
  onToken: (accessToken: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);

  // Preload, so the click handler can call FB.login() straight away - awaiting
  // the SDK download first would lose the user gesture and get the popup
  // blocked.
  useEffect(() => {
    let cancelled = false;
    loadFacebookSdk()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleClick() {
    setPending(true);
    try {
      const sdk = await loadFacebookSdk();
      onToken(await facebookLogin(sdk));
    } catch (error) {
      // Closing the dialog is not a failure worth reporting.
      if (!(error instanceof SocialCancelledError)) {
        onError?.("Facebook sign-in could not be completed. Try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={handleClick}
      disabled={disabled || pending || !ready}
    >
      {pending ? <Spinner /> : null}
      Continue with Facebook
    </Button>
  );
}
