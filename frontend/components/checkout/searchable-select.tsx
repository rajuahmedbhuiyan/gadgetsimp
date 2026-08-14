"use client";

/**
 * A select you can type into.
 *
 * Sixty-four districts and five hundred upazilas are far past the point where
 * a plain dropdown is usable - the list has to be filterable, and on a phone
 * typing three letters beats scrolling either list.
 *
 * Controlled by value, so the form owns the state and clearing the district
 * can clear the upazila with it.
 */

import { cn } from "@/lib/utils";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export function SearchableSelect({
  id,
  items,
  value,
  onValueChange,
  placeholder,
  emptyMessage = "No match",
  disabled,
  invalid,
  "aria-required": ariaRequired,
}: {
  id: string;
  items: readonly string[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  emptyMessage?: string;
  disabled?: boolean;
  invalid?: boolean;
  "aria-required"?: boolean;
}) {
  return (
    <Combobox
      items={items as string[]}
      value={value || null}
      onValueChange={(next) => onValueChange((next as string | null) ?? "")}
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-required={ariaRequired}
        className={cn("h-12 rounded-field text-base md:text-sm")}
      />

      <ComboboxContent>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
