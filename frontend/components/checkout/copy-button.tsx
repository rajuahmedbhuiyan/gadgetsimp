"use client";

/**
 * Copies a short value - here, the order number people read out on the phone.
 *
 * The confirmation is transient (it is held in session storage, not fetched),
 * so making the one thing worth writing down easy to lift is worth a button.
 * Falls back silently when the Clipboard API is unavailable, which is any
 * non-secure origin.
 */

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  // Reset the confirmation tick, and clean up if the component goes first.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={copied ? "Order number copied" : "Copy order number"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // No clipboard permission, or an insecure origin. The number is on
          // screen either way, so there is nothing useful to say.
        }
      }}
      className={cn(
        "flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {copied ? (
        <Check className="size-4 text-success" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
    </button>
  );
}
