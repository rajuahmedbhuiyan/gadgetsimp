"use client";

/**
 * Searching within the shop.
 *
 * Typed locally and pushed to the URL on a debounce - a keystroke is not a
 * search. Without the delay every letter would be a query, a history write and
 * a scroll-to-top, and `$text` search is the most expensive read the catalogue
 * has.
 *
 * Enter commits immediately, because someone who presses it has finished
 * typing and should not wait out the timer.
 *
 * The accessible name is deliberately not "Search products" - that belongs to
 * the site header's search, which is on this page too, and two controls with
 * the same name is ambiguous to anyone listing the page's form fields.
 */

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 350;

export function ShopSearch({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);

  /*
   * Re-sync when the URL changes from elsewhere - "Clear all" wipes the term,
   * and so does the Back button. Compared during render rather than in an
   * effect, which would paint the stale text for a frame first.
   */
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }

  // Held in a ref so a re-render mid-type does not restart the timer. Both
  // handlers below run from events, so each closes over the current
  // `onChange` - no latest-ref dance needed.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const schedule = (next: string) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), DEBOUNCE_MS);
  };

  const commitNow = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setDraft(next);
    onChange(next);
  };

  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />

      <Input
        type="search"
        value={draft}
        placeholder="Search products…"
        aria-label="Search the catalogue"
        onChange={(event) => schedule(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitNow(event.currentTarget.value);
          }
          if (event.key === "Escape") commitNow("");
        }}
        className={cn(
          "h-11 rounded-field bg-muted/40 pl-10 text-base md:text-sm",
          draft && "pr-10",
          // The browser's own clear affordance would sit beside ours.
          "[&::-webkit-search-cancel-button]:appearance-none",
        )}
      />

      {draft ? (
        <button
          type="button"
          onClick={() => commitNow("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
