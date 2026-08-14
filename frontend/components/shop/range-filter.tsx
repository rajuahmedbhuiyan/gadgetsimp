"use client";

/**
 * A numeric range: two handles, plus the two numbers written out.
 *
 * The slider is for exploring and the boxes are for precision - someone who
 * knows they want "under 2000" should not have to land a handle on it. Both
 * edit the same value.
 *
 * Committing is deliberate rather than continuous. Dragging a handle fires
 * dozens of values, and each one committed to the URL would be a history
 * entry and a network request; `onValueCommitted` fires once on release, and
 * the boxes commit on blur or Enter. In between, a local draft keeps the
 * control responsive without touching the query.
 */

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { RangeValue } from "@/lib/shop/filters";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

export function RangeFilter({
  label,
  min,
  max,
  value,
  onChange,
  prefix,
}: {
  label: string;
  min: number;
  max: number;
  value: RangeValue;
  onChange: (range: RangeValue | null) => void;
  /** e.g. `৳` for price. */
  prefix?: string;
}) {
  const low = value.min ?? min;
  const high = value.max ?? max;

  /*
   * Mirrors the committed value while idle, and holds the in-progress one
   * while dragging.
   *
   * Re-synced by a render-time comparison rather than an effect. It has to
   * track the bounds as well as the value, because both can change from
   * outside: a chip removed elsewhere clears the value, and the bounds arrive
   * late when the category's filter options finish loading. An effect would
   * paint the stale handles for a frame first, and setting state from one is
   * what the compiler rules forbid.
   */
  const [draft, setDraft] = useState<[number, number]>([low, high]);
  const [synced, setSynced] = useState<[number, number, number, number]>([
    low,
    high,
    min,
    max,
  ]);

  if (
    synced[0] !== low ||
    synced[1] !== high ||
    synced[2] !== min ||
    synced[3] !== max
  ) {
    setSynced([low, high, min, max]);
    setDraft([low, high]);
  }

  // Boxes are separate: a half-typed "2" must not commit as a range yet.
  const [text, setText] = useState<[string, string]>(["", ""]);
  const [editing, setEditing] = useState<0 | 1 | null>(null);

  const commit = (next: [number, number]) => {
    const clamped: [number, number] = [
      Math.max(min, Math.min(next[0], next[1])),
      Math.min(max, Math.max(next[0], next[1])),
    ];

    setDraft(clamped);

    // Back to the full span means "no filter", not "filter by everything" -
    // sending the bounds would exclude products with no value for it at all.
    if (clamped[0] <= min && clamped[1] >= max) {
      onChange(null);
      return;
    }

    onChange({ min: clamped[0], max: clamped[1] });
  };

  const commitBox = (index: 0 | 1) => {
    const parsed = Number(text[index]);
    setEditing(null);

    if (!Number.isFinite(parsed)) {
      setText(["", ""]);
      return;
    }

    const next: [number, number] = [...draft];
    next[index] = parsed;
    commit(next);
    setText(["", ""]);
  };

  const boxValue = (index: 0 | 1) =>
    editing === index ? text[index] : String(draft[index]);

  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">{label}</legend>

      <div className="px-1">
        <Slider
          value={draft}
          min={min}
          max={max}
          // Live while dragging, so the boxes track the handles...
          onValueChange={(next) =>
            Array.isArray(next) && setDraft([next[0]!, next[1]!])
          }
          // ...but only this writes to the URL and refetches.
          onValueCommitted={(next) =>
            Array.isArray(next) && commit([next[0]!, next[1]!])
          }
          aria-label={label}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Box
          value={boxValue(0)}
          prefix={prefix}
          ariaLabel={`${label} minimum`}
          onFocus={() => {
            setEditing(0);
            setText([String(draft[0]), ""]);
          }}
          onChange={(next) => setText([next, ""])}
          onCommit={() => commitBox(0)}
        />
        <span className="text-sm text-muted-foreground">–</span>
        <Box
          value={boxValue(1)}
          prefix={prefix}
          ariaLabel={`${label} maximum`}
          onFocus={() => {
            setEditing(1);
            setText(["", String(draft[1])]);
          }}
          onChange={(next) => setText(["", next])}
          onCommit={() => commitBox(1)}
        />
      </div>
    </fieldset>
  );
}

function Box({
  value,
  prefix,
  ariaLabel,
  onFocus,
  onChange,
  onCommit,
}: {
  value: string;
  prefix?: string;
  ariaLabel: string;
  onFocus: () => void;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <div className="relative flex-1">
      {prefix ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground"
        >
          {prefix}
        </span>
      ) : null}
      <Input
        inputMode="numeric"
        value={value}
        aria-label={ariaLabel}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className={cn(
          "h-9 rounded-lg text-sm tabular-nums",
          prefix && "pl-6",
        )}
      />
    </div>
  );
}
