"use client";

/**
 * Typeable pickers for brand and categories.
 *
 * Both lists grow with the shop, and a plain dropdown stops being usable well
 * before they stop growing. Typing two letters beats scrolling either one, and
 * on a phone it is the difference between usable and not.
 *
 * The category picker is multi-select, so it keeps the chosen items visible as
 * chips outside the popup - a combobox that hides the current answer behind a
 * click is the wrong shape for "is this filed in the right places".
 */

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CategoryLeaf, TaxonomyRef } from "@/lib/api/admin/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const TRIGGER =
  "h-11 w-full cursor-pointer justify-between rounded-lg px-3 text-sm font-normal";

function useFiltered(items: TaxonomyRef[], term: string) {
  return useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.name.toLowerCase().includes(needle));
  }, [items, term]);
}

/** A scrolling, keyboard-reachable list of options inside a popover. */
function OptionList({
  items,
  term,
  onTermChange,
  isSelected,
  onPick,
  placeholder,
}: {
  items: TaxonomyRef[];
  term: string;
  onTermChange: (value: string) => void;
  isSelected: (item: TaxonomyRef) => boolean;
  onPick: (item: TaxonomyRef) => void;
  placeholder: string;
}) {
  const filtered = useFiltered(items, term);

  return (
    <>
      <div className="relative border-b p-2">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          autoFocus
          value={term}
          placeholder={placeholder}
          onChange={(event) => onTermChange(event.target.value)}
          className="h-10 rounded-md pl-8 text-sm"
        />
      </div>

      <div className="max-h-64 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing matches “{term}”
          </p>
        ) : (
          filtered.map((item) => {
            const selected = isSelected(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onPick(item)}
                // `min-h-9`, matching the taller select rows - a list you
                // scroll on a phone needs a real target.
                className={cn(
                  "flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent",
                  selected && "font-medium",
                )}
              >
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    selected ? "opacity-100 text-brand" : "opacity-0",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

/* -------------------------------- single ---------------------------------- */

export function BrandPicker({
  brands,
  value,
  onChange,
  id,
}: {
  brands: TaxonomyRef[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const chosen = brands.find((brand) => brand.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button id={id} variant="outline" className={TRIGGER} type="button" />
        }
      >
        <span className={cn("truncate", !chosen && "text-muted-foreground")}>
          {chosen?.name ?? "No brand"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <OptionList
          items={brands}
          term={term}
          onTermChange={setTerm}
          placeholder="Search brands…"
          isSelected={(item) => item.id === value}
          onPick={(item) => {
            // Picking the current one clears it, so "no brand" needs no
            // separate row that would sort oddly in a searched list.
            onChange(item.id === value ? "" : item.id);
            setOpen(false);
            setTerm("");
          }}
        />

        {value ? (
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="w-full cursor-pointer rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              Clear brand
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------- categories -------------------------------- */

/**
 * One category, and it must be a leaf.
 *
 * A parent is a grouping rather than a shelf: filing a product under
 * "Electronics" says less than "Earbuds" does. So the popover lists only the
 * bottom of each branch, with the branch above it shown as the path - and the
 * parents are added back automatically when the product is saved, which is
 * what `CategoryLeaf.ancestors` carries.
 *
 * Searching matches the whole path, so typing "audio" finds every leaf under
 * Audio even when none of them is called that.
 */
export function CategoryLeafPicker({
  leaves,
  value,
  onChange,
  invalid,
  id,
}: {
  leaves: CategoryLeaf[];
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const chosen = leaves.find((leaf) => leaf.id === value) ?? null;

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return leaves;
    return leaves.filter((leaf) => leaf.path.toLowerCase().includes(needle));
  }, [leaves, term]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(TRIGGER, invalid && "border-destructive")}
          />
        }
      >
        <span className={cn("truncate", !chosen && "text-muted-foreground")}>
          {chosen ? chosen.path : "Choose a category"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[min(26rem,calc(100vw-2rem))] p-0"
      >
        <div className="relative border-b p-2">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            autoFocus
            value={term}
            placeholder="e.g. earbuds"
            aria-label="Search categories"
            onChange={(event) => setTerm(event.target.value)}
            className="h-10 rounded-md pl-8 text-sm"
          />
        </div>

        <div className="max-h-72 overflow-y-auto p-1">
          {leaves.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No categories yet. Create one first.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing matches “{term}”
            </p>
          ) : (
            filtered.map((leaf) => {
              const selected = leaf.id === value;
              return (
                <button
                  key={leaf.id}
                  type="button"
                  onClick={() => {
                    onChange(leaf.id);
                    setOpen(false);
                    setTerm("");
                  }}
                  className={cn(
                    "flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent",
                    selected && "font-medium",
                  )}
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      selected ? "text-brand opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    {/* The branch above the leaf, quietly, so two leaves with
                        the same name are still tellable apart. */}
                    {leaf.ancestors.length > 0 ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {leaf.ancestors.map((entry) => entry.name).join(" › ")}
                      </span>
                    ) : null}
                    <span className="block truncate">{leaf.name}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
