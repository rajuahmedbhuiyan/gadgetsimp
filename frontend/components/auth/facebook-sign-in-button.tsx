"use client";

import { useEffect, useState } from "react";

import { FaFacebookF } from "react-icons/fa6";

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
      className="h-12 w-full cursor-pointer gap-2.5 rounded-field text-sm font-medium hover:border-brand/50 hover:bg-muted"
      onClick={handleClick}
      disabled={disabled || pending || !ready}
    >
      {pending ? (
        <Spinner />
      ) : (
        <FaFacebookF className="size-4 text-[#1877F2]" aria-hidden />
      )}
      Continue with Facebook
    </Button>
  );
}
