"use client";

import { useEffect, useRef, useState } from "react";

import { FcGoogle } from "react-icons/fc";

import { googleClientId, loadGoogleIdentity } from "@/lib/auth/social";

/**
 * Continue with Google.
 *
 * The API wants an **ID token**, and `google.accounts.id` only hands one out
 * through a button it renders itself (or One Tap) - the `oauth2` half of the
 * SDK returns an access token, which this endpoint does not accept. That
 * button is an iframe, so its look cannot be changed: no border radius, no
 * height, no font.
 *
 * So it is kept, sized to the row, and laid over our own button at zero
 * opacity. The visual is ours and matches every other control on the page; the
 * click still lands on Google's real button, which is what mints the token.
 * Our copy is `aria-hidden` and the iframe keeps its own accessible name, so
 * assistive tech sees exactly one button.
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
    let observer: ResizeObserver | undefined;
    // Redrawing at an unchanged width would loop against the observer.
    let drawnAt = 0;

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

        /**
         * Google renders into an iframe at a width given in pixels - it has no
         * `100%` mode - so the width has to be measured and handed over, then
         * re-handed whenever the column changes size. A hardcoded value
         * overflows the card on a narrow phone and leaves a gap on a wide one.
         * 200-400 is the range the widget accepts.
         */
        const draw = () => {
          const element = container.current;
          if (!element) return;

          const width = Math.round(
            Math.min(400, Math.max(200, element.offsetWidth)),
          );
          if (width === drawnAt) return;
          drawnAt = width;

          // Also covers a remount, which would otherwise stack two buttons.
          element.replaceChildren();
          identity.renderButton(element, {
            type: "standard",
            theme: "outline",
            size: "large",
            text,
            shape: "rectangular",
            width,
            logo_alignment: "center",
          });
        };

        draw();
        observer = new ResizeObserver(draw);
        observer.observe(container.current);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [text]);

  if (failed) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Google sign-in is unavailable right now.
      </p>
    );
  }

  return (
    <div className="group relative h-12 w-full">
      {/* Ours: the one that is seen. Height and radius come from the same
          tokens as the fields above it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2.5 rounded-field border border-border bg-background text-sm font-medium transition-colors group-hover:border-brand/50 group-hover:bg-muted"
      >
        <FcGoogle className="size-5" />
        Continue with Google
      </div>

      {/* Google's: the one that is clicked. `scheme-light` stops the widget
          rendering its dark variant behind our light one, which would show
          through at the rounded corners. */}
      <div
        ref={container}
        className="absolute inset-0 flex cursor-pointer items-center justify-center overflow-hidden rounded-field opacity-0 scheme-light"
      />
    </div>
  );
}
