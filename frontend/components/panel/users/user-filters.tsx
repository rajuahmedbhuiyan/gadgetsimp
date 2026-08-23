"use client";

import { useState } from "react";
import { Filter, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/auth/roles";
import {
  USER_ROLES,
  USER_STATUSES,
  type UserSortBy,
} from "@/lib/api/admin/users";
import type { Role, UserStatus } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { USER_STATUS_LABEL } from "./user-badges";

export const USER_SORTS = [
  { value: "created-desc", label: "Newest first", sortBy: "createdAt", sortOrder: "desc" },
  { value: "created-asc", label: "Oldest first", sortBy: "createdAt", sortOrder: "asc" },
  { value: "login-desc", label: "Recent login", sortBy: "lastLoginAt", sortOrder: "desc" },
  { value: "login-asc", label: "Oldest login", sortBy: "lastLoginAt", sortOrder: "asc" },
  { value: "name-asc", label: "Name A-Z", sortBy: "fullName", sortOrder: "asc" },
  { value: "name-desc", label: "Name Z-A", sortBy: "fullName", sortOrder: "desc" },
  { value: "email-asc", label: "Email A-Z", sortBy: "email", sortOrder: "asc" },
  { value: "email-desc", label: "Email Z-A", sortBy: "email", sortOrder: "desc" },
  { value: "role-asc", label: "Role A-Z", sortBy: "role", sortOrder: "asc" },
  { value: "status-asc", label: "Status A-Z", sortBy: "status", sortOrder: "asc" },
] as const satisfies readonly {
  value: string;
  label: string;
  sortBy: UserSortBy;
  sortOrder: "asc" | "desc";
}[];

export interface UserFilterState {
  search: string;
  role: Role[];
  status: UserStatus[];
  verified: "any" | "yes" | "no";
  sort: string;
  limit: string;
  createdFrom: string;
  createdTo: string;
  includeDeleted: boolean;
}

const CONTROL = "h-10 rounded-lg text-sm";

interface Chip {
  key: string;
  label: string;
  clear: Partial<UserFilterState>;
}

function dateLabel(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function chipsFor(value: UserFilterState): Chip[] {
  const chips: Chip[] = [];

  for (const role of value.role) {
    chips.push({
      key: `role-${role}`,
      label: roleLabel(role),
      clear: { role: value.role.filter((entry) => entry !== role) },
    });
  }

  for (const status of value.status) {
    chips.push({
      key: `status-${status}`,
      label: USER_STATUS_LABEL[status],
      clear: { status: value.status.filter((entry) => entry !== status) },
    });
  }

  if (value.verified !== "any") {
    chips.push({
      key: "verified",
      label: value.verified === "yes" ? "Verified email" : "Unverified email",
      clear: { verified: "any" },
    });
  }

  if (value.createdFrom || value.createdTo) {
    chips.push({
      key: "created",
      label: value.createdFrom
        ? value.createdTo
          ? `${dateLabel(value.createdFrom)} - ${dateLabel(value.createdTo)}`
          : `${dateLabel(value.createdFrom)} onwards`
        : `Up to ${dateLabel(value.createdTo)}`,
      clear: { createdFrom: "", createdTo: "" },
    });
  }

  if (value.includeDeleted) {
    chips.push({
      key: "deleted",
      label: "Including deleted",
      clear: { includeDeleted: false },
    });
  }

  if (value.limit !== "20") {
    chips.push({ key: "limit", label: `${value.limit} per page`, clear: { limit: "20" } });
  }

  return chips;
}

export function UserFilters({
  value,
  resultCount,
  onChange,
  onClear,
}: {
  value: UserFilterState;
  resultCount: number | null;
  onChange: (patch: Partial<UserFilterState>) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const chips = chipsFor(value);
  const touched =
    chips.length > 0 || Boolean(value.search) || value.sort !== "created-desc";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={value.search}
            placeholder="Name or email..."
            aria-label="Search users"
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
              className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
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

        <Button
          variant={chips.length > 0 ? "secondary" : "outline"}
          onClick={() => setOpen(true)}
          className={cn(CONTROL, "shrink-0 cursor-pointer gap-2 px-3")}
        >
          <Filter className="size-4" aria-hidden />
          <span className="max-sm:sr-only">Filters</span>
          {chips.length > 0 ? (
            <Badge className="size-5 justify-center rounded-full p-0 text-[0.6875rem] tabular-nums">
              {chips.length}
            </Badge>
          ) : null}
        </Button>
      </div>

      <ToggleRow
        label="Roles"
        allLabel="All roles"
        options={USER_ROLES}
        value={value.role}
        labels={roleLabel}
        onChange={(role) => onChange({ role })}
      />
{/* 
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChange(chip.clear)}
              aria-label={`Remove filter: ${chip.label}`}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border bg-card py-1 pr-1.5 pl-2.5 text-xs font-medium hover:bg-muted"
            >
              {chip.label}
              <X className="size-3 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </div>
      ) : null} */}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[450px]! max-w-[100vw]! overflow-y-auto">
          {open ? (
            <FilterDraft
              applied={value}
              resultCount={resultCount}
              onClose={() => setOpen(false)}
              onApply={(next) => {
                onChange(next);
                setOpen(false);
              }}
              onClear={() => {
                onClear();
                setOpen(false);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ToggleRow<T extends string>({
  label,
  allLabel,
  options,
  value,
  labels,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: readonly T[];
  value: T[];
  labels: (value: T) => string;
  onChange: (value: T[]) => void;
}) {
  const toggle = (option: T) =>
    onChange(
      value.includes(option)
        ? value.filter((entry) => entry !== option)
        : [...value, option],
    );

  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Tab active={value.length === 0} onClick={() => onChange([])}>
        {allLabel}
      </Tab>
      {options.map((option) => (
        <Tab key={option} active={value.includes(option)} onClick={() => toggle(option)}>
          {labels(option)}
        </Tab>
      ))}
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "border-brand bg-brand/15 text-brand-foreground dark:text-brand"
          : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FilterDraft({
  applied,
  resultCount,
  onApply,
  onClear,
  onClose,
}: {
  applied: UserFilterState;
  resultCount: number | null;
  onApply: (patch: Partial<UserFilterState>) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(applied);
  const patch = (next: Partial<UserFilterState>) =>
    setDraft((current) => ({ ...current, ...next }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const datesBackwards =
    Boolean(draft.createdFrom && draft.createdTo) &&
    draft.createdFrom > draft.createdTo;

  return (
    <>
      <SheetHeader className="border-b p-4 pr-12">
        <SheetTitle>Filter users</SheetTitle>
        <SheetDescription>
          Role changes apply on the page. Everything here waits for Apply.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6 p-4">
        <Group label="Sort by">
          <Select value={draft.sort} onValueChange={(next) => patch({ sort: String(next) })}>
            <SelectTrigger
              aria-label="Sort users"
              className={cn(CONTROL, "data-[size=default]:h-10 w-full cursor-pointer")}
            >
              <SelectValue>
                {(current) =>
                  USER_SORTS.find((option) => option.value === current)?.label ?? "Sort"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {USER_SORTS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Group>

        <Group label="Status">
          <ToggleRow
            label="Statuses"
            allLabel="Any status"
            options={USER_STATUSES}
            value={draft.status}
            labels={(status) => USER_STATUS_LABEL[status]}
            onChange={(status) => patch({ status })}
          />
        </Group>

        <Group label="Email verification">
          <Select
            value={draft.verified}
            onValueChange={(next) => patch({ verified: next as UserFilterState["verified"] })}
          >
            <SelectTrigger
              aria-label="Filter by email verification"
              className={cn(CONTROL, "data-[size=default]:h-10 w-full cursor-pointer")}
            >
              <SelectValue>
                {(current) =>
                  current === "yes"
                    ? "Verified"
                    : current === "no"
                      ? "Unverified"
                      : "Any verification"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any verification</SelectItem>
              <SelectItem value="yes">Verified</SelectItem>
              <SelectItem value="no">Unverified</SelectItem>
            </SelectContent>
          </Select>
        </Group>

        <Group label="Created between">
          <div className="grid grid-cols-2 gap-3">
            <Labelled label="From" htmlFor="user-created-from">
              <Input
                id="user-created-from"
                type="date"
                value={draft.createdFrom}
                onChange={(event) => patch({ createdFrom: event.target.value })}
                aria-invalid={datesBackwards}
                className={cn(CONTROL, "cursor-pointer")}
              />
            </Labelled>
            <Labelled label="To" htmlFor="user-created-to">
              <Input
                id="user-created-to"
                type="date"
                value={draft.createdTo}
                onChange={(event) => patch({ createdTo: event.target.value })}
                aria-invalid={datesBackwards}
                className={cn(CONTROL, "cursor-pointer")}
              />
            </Labelled>
          </div>
          {datesBackwards ? (
            <p className="text-xs text-destructive">The start is after the end.</p>
          ) : null}
        </Group>

        <Group label="Page size">
          <Select value={draft.limit} onValueChange={(next) => patch({ limit: String(next) })}>
            <SelectTrigger
              aria-label="Users per page"
              className={cn(CONTROL, "data-[size=default]:h-10 w-full cursor-pointer")}
            >
              <SelectValue>{(current) => `${current} per page`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {["20", "50", "100"].map((option) => (
                <SelectItem key={option} value={option}>
                  {option} per page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Group>

        <Group label="Deleted users">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3">
            <Checkbox
              checked={draft.includeDeleted}
              onCheckedChange={(next) => patch({ includeDeleted: next === true })}
              className="mt-0.5 cursor-pointer"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">Include deleted</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                Deleted accounts stay hidden unless included or filtered by status.
              </span>
            </span>
          </label>
        </Group>
      </div>

      <SheetFooter className="sticky bottom-0 gap-3 border-t bg-popover">
        {resultCount !== null && !dirty ? (
          <p className="text-center text-xs text-muted-foreground">
            Matching {resultCount} user{resultCount === 1 ? "" : "s"}
          </p>
        ) : null}
        <div className="flex flex-row gap-2">
          <Button variant="outline" onClick={onClear} className="h-10 flex-1 cursor-pointer rounded-lg text-sm">
            Clear all
          </Button>
          <Button
            onClick={() => (dirty ? onApply(draft) : onClose())}
            disabled={datesBackwards}
            className="h-10 flex-1 cursor-pointer rounded-lg text-sm font-semibold"
          >
            {dirty ? "Apply filters" : "Done"}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="font-heading text-sm font-bold tracking-tight">{label}</h3>
      {children}
    </section>
  );
}

function Labelled({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
