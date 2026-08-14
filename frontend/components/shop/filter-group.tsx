"use client";

/**
 * One dynamic filter group.
 *
 * The category decides both which groups exist and how each is drawn, so
 * nothing here is hardcoded to an attribute name - `type` picks the control
 * and the rest is data. A new attribute in the admin appears in the sidebar
 * with no change to this file.
 *
 * `checkbox` and `select` are both multi-select here. The distinction upstream
 * is about how the *admin* enters a value, not how a shopper filters by it,
 * and a filter list that only allows one choice is a worse list - "show me
 * IP67 or IPX5" is a normal thing to want.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilterGroup as Group } from "@/lib/api/shop";
import { formatFilterLabel, formatFilterValue } from "@/lib/shop/labels";
import type { RangeValue } from "@/lib/shop/filters";
import { Checkbox } from "@/components/ui/checkbox";
import { RangeFilter } from "./range-filter";

/** Longer lists collapse; short ones are shown whole. */
const VISIBLE_OPTIONS = 6;

export function FilterGroup({
  group,
  value,
  onToggle,
  onRange,
}: {
  group: Group;
  value: string[] | RangeValue | undefined;
  onToggle: (optionValue: string) => void;
  onRange: (range: RangeValue | null) => void;
}) {
  if (group.type === "range") {
    const bounds = group.limits ?? group.range;
    if (!bounds) return null;

    return (
      <RangeFilter
        label={formatFilterLabel(group.label)}
        // The span the data covers, so the handles do not start miles from
        // any real product.
        min={group.range?.min ?? bounds.min}
        max={group.range?.max ?? bounds.max}
        value={(value && !Array.isArray(value) ? value : {}) as RangeValue}
        onChange={onRange}
      />
    );
  }

  if (group.options.length === 0) return null;

  const selected = Array.isArray(value) ? value : [];

  return (
    <OptionList
      group={group}
      selected={selected}
      onToggle={onToggle}
      swatches={group.type === "color"}
    />
  );
}

function OptionList({
  group,
  selected,
  onToggle,
  swatches,
}: {
  group: Group;
  selected: string[];
  onToggle: (value: string) => void;
  swatches: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const overflowing = group.options.length > VISIBLE_OPTIONS;
  const visible =
    expanded || !overflowing
      ? group.options
      : group.options.slice(0, VISIBLE_OPTIONS);

  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">
        {formatFilterLabel(group.label)}
      </legend>

      <div className="flex flex-col gap-0.5">
        {visible.map((option) => {
          const checked = selected.includes(option.value);
          const id = `${group.key}-${option.value}`;

          return (
            <label
              key={option.value}
              htmlFor={id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/60"
            >
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={() => onToggle(option.value)}
                className="shrink-0"
              />

              {swatches ? <Swatch value={option.value} /> : null}

              <span className="min-w-0 flex-1 truncate text-sm">
                {formatFilterValue(option.value, option.label)}
              </span>

              {/* Counts are for the whole category, not narrowed by the other
                  filters - the listing endpoint returns no facets, so there is
                  nothing to narrow them with. Muted so they read as a rough
                  size rather than a promise about the current result. */}
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {option.count}
              </span>
            </label>
          );
        })}
      </div>

      {overflowing ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-1.5 flex cursor-pointer items-center gap-1 px-1.5 text-xs font-medium text-brand-foreground transition-colors hover:underline dark:text-brand"
        >
          {expanded
            ? "Show less"
            : `Show ${group.options.length - VISIBLE_OPTIONS} more`}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      ) : null}
    </fieldset>
  );
}

/**
 * A colour chip beside the name.
 *
 * Named colours only, resolved through a table rather than trusting the slug
 * as a CSS colour: `graphite` and `navy` are not CSS keywords, and handing an
 * unknown slug to `background` would silently paint nothing. Anything
 * unmapped falls back to a neutral chip, so the row still lines up.
 */
const SWATCHES: Record<string, string> = {
  black: "#111111",
  white: "#f5f5f5",
  silver: "#c4c6c8",
  graphite: "#4a4a4d",
  navy: "#1c2a4a",
  blue: "#2563eb",
  green: "#16a34a",
  red: "#dc2626",
  pink: "#ec4899",
  purple: "#7c3aed",
  gold: "#d4af37",
  beige: "#e8dcc8",
  brown: "#7c4a2d",
  grey: "#9ca3af",
  gray: "#9ca3af",
  yellow: "#eab308",
  orange: "#f97316",
  transparent: "transparent",
};

function Swatch({ value }: { value: string }) {
  const colour = SWATCHES[value.toLowerCase()];

  return (
    <span
      aria-hidden
      className={cn(
        "size-4 shrink-0 rounded-full border",
        !colour && "bg-muted",
        value.toLowerCase() === "transparent" &&
          "bg-[repeating-conic-gradient(#ccc_0_25%,#fff_0_50%)] bg-[length:8px_8px]",
      )}
      style={colour && colour !== "transparent" ? { background: colour } : undefined}
    />
  );
}
