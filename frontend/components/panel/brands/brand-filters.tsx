"use client";

import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CONTROL = "h-10 rounded-lg text-sm";

export function BrandFilters({
  search,
  onSearchChange,
  onClear,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={search}
          placeholder="Search brands..."
          aria-label="Search brands by name or slug"
          onChange={(event) => onSearchChange(event.target.value)}
          className={cn(
            CONTROL,
            "pl-9",
            search && "pr-9",
            "[&::-webkit-search-cancel-button]:appearance-none",
          )}
        />
        {search ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearchChange("")}
            className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {search ? (
        <Button
          variant="outline"
          onClick={onClear}
          aria-label="Clear all filters"
          className={cn(CONTROL, "shrink-0 cursor-pointer gap-2 px-3")}
        >
          <X className="size-4" aria-hidden />
          <span className="max-sm:sr-only">Clear all</span>
        </Button>
      ) : null}
    </div>
  );
}
