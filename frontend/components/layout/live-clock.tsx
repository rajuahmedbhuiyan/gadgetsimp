"use client";

/**
 * The date and time in the top bar.
 *
 * The wall clock is an external, mutable source, so it is read through
 * `useSyncExternalStore` rather than mirrored into state from an effect. The
 * server snapshot is `0`, which renders the empty placeholder — the server has
 * no idea what timezone the shopper is in, and any date it produced would be
 * replaced a moment later.
 *
 * The wrapper reserves its width up front so the bar does not reflow when the
 * value appears.
 */

import { useSyncExternalStore } from "react";
import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";

/* --------------------------- the clock as a store ------------------------ */

let tick = 0;
const listeners = new Set<() => void>();

function emit() {
  tick = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);

  // Seed immediately so the first paint after hydration already has a time,
  // rather than waiting a full second for the interval.
  if (tick === 0) tick = Date.now();

  // One interval shared by every mounted clock, lined up with the wall clock
  // so the seconds do not visibly drift from the phone's own display.
  let interval: ReturnType<typeof setInterval> | undefined;
  const align = setTimeout(() => {
    emit();
    interval = setInterval(emit, 1000);
  }, 1000 - (Date.now() % 1000));

  return () => {
    listeners.delete(onStoreChange);
    clearTimeout(align);
    if (interval && listeners.size === 0) clearInterval(interval);
  };
}

const getSnapshot = () => tick;
const getServerSnapshot = () => 0;

/* ------------------------------- formatting ------------------------------ */

/** Built once, not per tick. */
const full = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const compact = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

const clock = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export function LiveClock({ className }: { className?: string }) {
  const timestamp = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const now = timestamp ? new Date(timestamp) : null;

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1.5 text-xs font-medium tabular-nums",
        className,
      )}
    >
      <CalendarDays className="size-3.5 shrink-0 opacity-70" aria-hidden />
      {/* Holds the row's height and width before the first tick lands. */}
      <span className="min-w-42 text-center sm:min-w-54">
        {now && (
          <time dateTime={now.toISOString()} suppressHydrationWarning>
            <span className="hidden sm:inline">{full.format(now)}</span>
            <span className="sm:hidden">{compact.format(now)}</span>
            <span className="mx-1.5 opacity-40">·</span>
            {clock.format(now)}
          </time>
        )}
      </span>
    </div>
  );
}
