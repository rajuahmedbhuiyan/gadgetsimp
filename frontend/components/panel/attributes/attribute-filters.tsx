"use client";

import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ATTRIBUTE_SOURCES,
  ATTRIBUTE_TYPES,
  CATALOG_STATUSES,
  type AttributeSource,
  type AttributeType,
  type CatalogStatus,
} from "@/lib/api/admin/attributes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ATTRIBUTE_SOURCE_LABEL,
  ATTRIBUTE_TYPE_LABEL,
  CATALOG_STATUS_LABEL,
} from "./attribute-badges";

const CONTROL = "h-10 rounded-lg text-sm";
const ALL = "__all";

export interface AttributeFilterState {
  search: string;
  source: AttributeSource | "";
  type: AttributeType | "";
  status: CatalogStatus | "";
}

export function AttributeFilters({
  value,
  onChange,
  onClear,
}: {
  value: AttributeFilterState;
  onChange: (patch: Partial<AttributeFilterState>) => void;
  onClear: () => void;
}) {
  const touched =
    Boolean(value.search) ||
    Boolean(value.source) ||
    Boolean(value.type) ||
    Boolean(value.status);

  return (
    <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-end">
      <div className="flex min-w-0 items-center gap-2 xl:flex-1">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={value.search}
            placeholder="Search attributes..."
            aria-label="Search attributes by name, key or slug"
            onChange={(event) => onChange({ search: event.target.value })}
            className={cn(
              CONTROL,
              "pl-9",
              value.search && "pr-9",
              "[&::-webkit-search-cancel-button]:appearance-none",
            )}
          />
          {value.search ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChange({ search: "" })}
              className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>

        {touched ? (
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

      <div className="grid min-w-0 grid-cols-2 gap-2 xl:flex xl:shrink-0">
        <FilterSelect
          label="Source"
          value={value.source}
          allLabel="All sources"
          options={ATTRIBUTE_SOURCES}
          labels={ATTRIBUTE_SOURCE_LABEL}
          onChange={(source) => onChange({ source: source as AttributeSource | "" })}
        />
        <FilterSelect
          label="Type"
          value={value.type}
          allLabel="All types"
          options={ATTRIBUTE_TYPES}
          labels={ATTRIBUTE_TYPE_LABEL}
          onChange={(type) => onChange({ type: type as AttributeType | "" })}
        />
        <FilterSelect
          label="Status"
          className="col-span-2"
          value={value.status}
          allLabel="All statuses"
          options={CATALOG_STATUSES}
          labels={CATALOG_STATUS_LABEL}
          onChange={(status) => onChange({ status: status as CatalogStatus | "" })}
        />

      </div>
    </div>
  );
}

function FilterSelect<T extends string>({
  label,
  className,
  value,
  allLabel,
  options,
  labels,
  onChange,
}: {
  label: string;
  className?: string;
  value: T | "";
  allLabel: string;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T | "") => void;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Select
        value={value || ALL}
        onValueChange={(next) => onChange(next === ALL ? "" : (next as T))}
      >
        <SelectTrigger
          aria-label={label}
          className={cn(CONTROL, "data-[size=default]:h-10 w-full min-w-0 cursor-pointer xl:w-40")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labels[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
