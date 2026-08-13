"use client";

/**
 * The catalogue search in the header.
 *
 * A plain GET form pointed at `/shop`, so it submits without JavaScript and
 * the result is a shareable, back-button-friendly URL. Typeahead can layer on
 * top later; it should not be what makes search work.
 *
 * Client-side only for the `/` shortcut — the hint is rendered next to the
 * field, so the key has to actually do something.
 */

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { searchConfig } from "@/lib/config/site";
import { Input } from "@/components/ui/input";

/** Typing `/` inside a field means a slash, not a shortcut. */
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export function SearchBar({ className }: { className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      if (isTypingTarget(event.target)) return;

      event.preventDefault();
      inputRef.current?.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <form
      action={searchConfig.action}
      role="search"
      className={cn("relative w-full", className)}
    >
      <Search
        className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      {/* A defined border and a card background, not a tinted fill. The muted
          fill sat too close to the header behind it for the field to read as
          an input at all. */}
      <Input
        ref={inputRef}
        type="search"
        name={searchConfig.name}
        placeholder={searchConfig.placeholder}
        aria-label="Search products"
        aria-keyshortcuts="/"
        className="h-11 rounded-full border-2 border-border bg-card pl-11 text-sm shadow-none transition-colors placeholder:text-muted-foreground hover:border-brand/40 focus-visible:border-brand focus-visible:bg-background"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground xl:block">
        /
      </kbd>
    </form>
  );
}
