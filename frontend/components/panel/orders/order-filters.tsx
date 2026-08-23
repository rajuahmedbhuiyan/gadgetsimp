"use client";

/**
 * Finding an order.
 *
 * Three tiers, by how often each is reached for. The search box and the status
 * tabs are on the page, because between them they answer almost every question
 * anyone actually has: someone is on the phone reading out a number, or the
 * question is "what still needs confirming". The other eight controls live in
 * a drawer.
 *
 * The drawer **stages** its changes. Everything else here applies on the spot -
 * a tab, a chip, a keystroke - because each is a single decision you can see
 * the result of. Setting a date range and a total range and a customer id is
 * not one decision, and re-running the query after each half-typed number
 * makes the list flicker through states nobody asked for. So it collects, and
 * Apply commits.
 */

import { useState } from "react";
import { Filter, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  type OrderStatusName,
} from "@/lib/api/admin/orders";
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
import { ORDER_STATUS_LABEL, paymentMethodLabel } from "./order-status-badge";

/**
 * The six sorts the API's three sort fields make sense in.
 *
 * `status` sorts alphabetically - the API sorts the stored string - so it is
 * labelled A-Z rather than "by progress", which is what someone would
 * otherwise reasonably assume it did.
 */
export const ORDER_SORTS = [
  { value: "newest", label: "Newest first", field: "placedAt", direction: "desc" },
  { value: "oldest", label: "Oldest first", field: "placedAt", direction: "asc" },
  { value: "total-desc", label: "Highest total", field: "total", direction: "desc" },
  { value: "total-asc", label: "Lowest total", field: "total", direction: "asc" },
  { value: "status-asc", label: "Status A–Z", field: "status", direction: "asc" },
  { value: "status-desc", label: "Status Z–A", field: "status", direction: "desc" },
] as const;

/** Everything the URL carries. Strings, because these are what inputs hold. */
export interface OrderFilterState {
  search: string;
  status: OrderStatusName[];
  paymentMethod: string;
  sort: string;
  minTotal: string;
  maxTotal: string;
  placedFrom: string;
  placedTo: string;
  userId: string;
  guestOnly: boolean;
  includeDeleted: boolean;
}

const CONTROL = "h-10 rounded-lg text-sm";
const ANY = "__any__";

/**
 * The screen opens on today, in every status.
 *
 * Bounding by day rather than by status is what keeps the landing view both
 * complete and small: today's orders are the ones with anything left to do,
 * whichever state they are in, and the set stops growing at closing time
 * instead of every month forever.
 *
 * `TODAY` is a marker, not a date. Holding it rather than a resolved
 * `2026-08-23` keeps a bookmarked URL honest - it still means *today*
 * tomorrow - and keeps the server and the browser from disagreeing about
 * which day it is while rendering.
 */
export const TODAY = "today";

/**
 * "No date bound at all", written down.
 *
 * The screen opens on a day, so the day has to be clearable - otherwise
 * "clear all filters" on a quiet morning empties every other control and
 * leaves you looking at the same empty list, which reads as a broken button.
 * `clearOnDefault` strips a parameter equal to its default, so an absent
 * `from` already means today; this is what says the opposite out loud.
 */
export const ANY_DATE = "any";

/** This device's date as `YYYY-MM-DD`, in local time rather than UTC. */
function todayISO(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * A stored bound to an actual date.
 *
 * Only ever called where the result is not rendered during a server pass - the
 * query body, and the drawer, which mounts on open. The same call in the
 * server's timezone and in the browser's can name different days for six hours
 * out of twenty-four here, and that difference in rendered markup is a
 * hydration error.
 */
export function resolveDate(value: string): string {
  if (value === ANY_DATE) return "";
  return value === TODAY ? todayISO() : value;
}

/** `2026-08-25` -> `25 Aug`. The marker keeps its own word. */
function dateLabel(value: string): string {
  if (value === TODAY) return "Today";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/* --------------------------------- tabs ---------------------------------- */

/**
 * The status row, on the page rather than behind the drawer.
 *
 * Tabs in shape, but each one toggles rather than selecting alone: the API
 * takes an array, and the real question is usually "what is still open" -
 * Pending and Confirmed together, not either by itself. `All` is the only
 * exclusive one, because it means "no status filter" rather than "every
 * status", which is the same result by a shorter route.
 */
export function OrderStatusTabs({
  value,
  onChange,
}: {
  value: OrderStatusName[];
  onChange: (status: OrderStatusName[]) => void;
}) {
  const toggle = (status: OrderStatusName) =>
    onChange(
      value.includes(status)
        ? value.filter((entry) => entry !== status)
        : [...value, status],
    );

  return (
    // Scrolls rather than wraps: seven pills on a phone would otherwise take
    // three lines before the table has started.
    <div
      role="group"
      aria-label="Filter by status"
      className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Tab active={value.length === 0} onClick={() => onChange([])}>
        All
      </Tab>
      {ORDER_STATUSES.map((status) => (
        <Tab
          key={status}
          active={value.includes(status)}
          onClick={() => toggle(status)}
        >
          {ORDER_STATUS_LABEL[status]}
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

/* --------------------------------- chips --------------------------------- */

/** One removable thing the reader can see is narrowing their list. */
interface Chip {
  key: string;
  label: string;
  clear: Partial<OrderFilterState>;
}

/**
 * What the drawer has applied, as chips.
 *
 * Status is absent: the tabs above already show it, and two controls for one
 * filter is one too many. Sort is absent too - it reorders the results rather
 * than removing any, so offering to "clear" it would imply something is
 * missing from the list.
 */
function chipsFor(value: OrderFilterState): Chip[] {
  const chips: Chip[] = [];

  if (value.paymentMethod) {
    chips.push({
      key: "payment",
      label: paymentMethodLabel(value.paymentMethod),
      clear: { paymentMethod: "" },
    });
  }

  if (value.minTotal) {
    chips.push({
      key: "min",
      label: `From ${formatPrice(Number(value.minTotal))}`,
      clear: { minTotal: "" },
    });
  }

  if (value.maxTotal) {
    chips.push({
      key: "max",
      label: `Up to ${formatPrice(Number(value.maxTotal))}`,
      clear: { maxTotal: "" },
    });
  }

  /*
   * One chip for the pair, and none at all while it is still today.
   *
   * The range is never empty - there is always a day on screen - so a chip
   * that always showed would be a permanent extra row saying what the date
   * boxes already say. It appears when the day is no longer the one the screen
   * opens on, which is the only time anyone needs telling.
   */
  const { placedFrom: from, placedTo: to } = value;
  const bounded = from !== ANY_DATE || to !== ANY_DATE;

  // Nothing to say while it is still the day the screen opens on, and nothing
  // to say once both ends are off - neither is narrowing anything the reader
  // did not already expect.
  if (bounded && !(from === TODAY && to === TODAY)) {
    chips.push({
      key: "dates",
      label:
        from === ANY_DATE
          ? `Up to ${dateLabel(to)}`
          : to === ANY_DATE
            ? `${dateLabel(from)} onwards`
            : from === to
              ? dateLabel(from)
              : `${dateLabel(from)} – ${dateLabel(to)}`,
      clear: { placedFrom: ANY_DATE, placedTo: ANY_DATE },
    });
  }

  if (value.userId) {
    chips.push({
      key: "customer",
      label: `Customer #${value.userId}`,
      clear: { userId: "" },
    });
  }

  if (value.guestOnly) {
    chips.push({ key: "guests", label: "Guests only", clear: { guestOnly: false } });
  }

  if (value.includeDeleted) {
    chips.push({
      key: "deleted",
      label: "Including deleted",
      clear: { includeDeleted: false },
    });
  }

  return chips;
}

/* --------------------------------- filters -------------------------------- */

export function OrderFilters({
  value,
  onChange,
  onClear,
  resultCount,
}: {
  value: OrderFilterState;
  /** Partial, so a control only ever names the field it owns. */
  onChange: (patch: Partial<OrderFilterState>) => void;
  onClear: () => void;
  /** What the current filter matches, for the drawer's Apply button. */
  resultCount: number | null;
}) {
  const [open, setOpen] = useState(false);
  const chips = chipsFor(value);

  /**
   * Something is actually narrowing the list.
   *
   * The opening day bound is a real filter even though it does not need a
   * permanent chip. Once both ends are open, the clear button can disappear.
   * Sort is out because it reorders rather than removes rows.
   */
  const dateBound = value.placedFrom !== ANY_DATE || value.placedTo !== ANY_DATE;
  const touched =
    chips.length > 0 ||
    dateBound ||
    Boolean(value.search) ||
    value.status.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          {/*
            * Uncontrolled by the URL and debounced by the screen above - see
            * `OrdersView`. Typing an order number should not be six requests
            * and six history writes.
            */}
          <Input
            type="search"
            value={value.search}
            placeholder="Order number, name, phone or email…"
            aria-label="Search orders"
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

        {/*
          * Between the search box and Filters, and only once something is off
          * its default. It is a sibling of the controls that narrowed the list
          * rather than a footnote to them, and a row of its own cost a strip of
          * vertical space on a screen whose whole job is fitting more table.
          */}
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

      <OrderStatusTabs
        value={value.status}
        onChange={(status) => onChange({ status })}
      />

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChange(chip.clear)}
              aria-label={`Remove filter: ${chip.label}`}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border bg-card py-1 pr-1.5 pl-2.5 text-xs font-medium transition-colors hover:bg-muted"
            >
              {chip.label}
              <X className="size-3 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-[450px]! max-w-[100vw]! gap-0 overflow-y-auto"
        >
          {/*
            * Mounted only while open, which is what re-seeds the draft from
            * the applied filters each time. Closing without applying discards
            * whatever was half-set, and reopening starts from the truth.
            */}
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

/* --------------------------------- drawer -------------------------------- */

/**
 * The staged copy.
 *
 * Holds its own state and hands the whole thing back on Apply. Nothing typed
 * in here reaches the URL or the API until then, so a range that is briefly
 * `min 5000, max 0` on the way to being typed never becomes a query.
 */
function FilterDraft({
  applied,
  resultCount,
  onApply,
  onClear,
  onClose,
}: {
  applied: OrderFilterState;
  resultCount: number | null;
  onApply: (patch: Partial<OrderFilterState>) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(applied);
  const patch = (next: Partial<OrderFilterState>) =>
    setDraft((current) => ({ ...current, ...next }));

  // Search and status are owned by the controls on the page; the drawer never
  // touches them, so they are excluded from what Apply writes back.
  const dirty =
    draft.paymentMethod !== applied.paymentMethod ||
    draft.sort !== applied.sort ||
    draft.minTotal !== applied.minTotal ||
    draft.maxTotal !== applied.maxTotal ||
    draft.placedFrom !== applied.placedFrom ||
    draft.placedTo !== applied.placedTo ||
    draft.userId !== applied.userId ||
    draft.guestOnly !== applied.guestOnly ||
    draft.includeDeleted !== applied.includeDeleted;

  const rangeBackwards =
    Boolean(draft.minTotal && draft.maxTotal) &&
    Number(draft.minTotal) > Number(draft.maxTotal);
  const fromDate = resolveDate(draft.placedFrom);
  const toDate = resolveDate(draft.placedTo);
  const datesBackwards = Boolean(fromDate && toDate) && fromDate > toDate;

  return (
    <>
      <SheetHeader className="border-b p-4 pr-12">
        <SheetTitle>Filter orders</SheetTitle>
        <SheetDescription>
          Nothing changes until you apply. Status and search stay on the page.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6 p-4">
        <Group label="Sort by">
          <Select
            value={draft.sort}
            onValueChange={(next) => patch({ sort: String(next) })}
          >
            <SelectTrigger
              aria-label="Sort orders"
              className={cn(CONTROL, "data-[size=default]:h-10 w-full cursor-pointer")}
            >
              <SelectValue>
                {(current) =>
                  ORDER_SORTS.find((option) => option.value === current)?.label ??
                  "Sort"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ORDER_SORTS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="cursor-pointer text-sm"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Group>

        <Group label="Payment method">
          <Select
            value={draft.paymentMethod || ANY}
            onValueChange={(next) =>
              patch({ paymentMethod: String(next) === ANY ? "" : String(next) })
            }
          >
            <SelectTrigger
              aria-label="Filter by payment method"
              className={cn(CONTROL, "data-[size=default]:h-10 w-full cursor-pointer")}
            >
              <SelectValue>
                {(current) =>
                  current === ANY || !current
                    ? "Any method"
                    : paymentMethodLabel(String(current))
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY} className="cursor-pointer text-sm">
                Any method
              </SelectItem>
              {PAYMENT_METHODS.map((method) => (
                <SelectItem
                  key={method}
                  value={method}
                  className="cursor-pointer text-sm"
                >
                  {paymentMethodLabel(method)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Group>

        <Group label="Order total">
          <div className="grid grid-cols-2 gap-3">
            <Labelled label="From" htmlFor="filter-min">
              <Input
                id="filter-min"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="0"
                value={draft.minTotal}
                onChange={(event) => patch({ minTotal: event.target.value })}
                aria-invalid={rangeBackwards}
                className={cn(CONTROL, "tabular-nums")}
              />
            </Labelled>
            <Labelled label="To" htmlFor="filter-max">
              <Input
                id="filter-max"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Any"
                value={draft.maxTotal}
                onChange={(event) => patch({ maxTotal: event.target.value })}
                aria-invalid={rangeBackwards}
                className={cn(CONTROL, "tabular-nums")}
              />
            </Labelled>
          </div>
          {/* The API refuses this pair with `minTotal must not exceed
              maxTotal`; catching it here saves the round trip. */}
          {rangeBackwards ? (
            <p className="text-xs text-destructive">
              The lower bound is above the upper one.
            </p>
          ) : null}
        </Group>

        <Group label="Placed between">
          <div className="grid grid-cols-2 gap-3">
            <Labelled label="From" htmlFor="filter-from">
              <Input
                id="filter-from"
                type="date"
                value={resolveDate(draft.placedFrom)}
                // An emptied box means "no bound on this end", not "back to
                // today" - unset is what would mean today.
                onChange={(event) =>
                  patch({ placedFrom: event.target.value || ANY_DATE })
                }
                aria-invalid={datesBackwards}
                className={cn(CONTROL, "cursor-pointer")}
              />
            </Labelled>
            <Labelled label="To" htmlFor="filter-to">
              <Input
                id="filter-to"
                type="date"
                value={resolveDate(draft.placedTo)}
                onChange={(event) =>
                  patch({ placedTo: event.target.value || ANY_DATE })
                }
                aria-invalid={datesBackwards}
                className={cn(CONTROL, "cursor-pointer")}
              />
            </Labelled>
          </div>
          {datesBackwards ? (
            <p className="text-xs text-destructive">
              The start is after the end.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Whole days, both ends included — from the start of the first to
              the end of the last. Empty either box to leave that end open.
            </p>
          )}
        </Group>

        <Group label="Customer">
          <Labelled label="Account ID" htmlFor="filter-user">
            <Input
              id="filter-user"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="Any customer"
              value={draft.userId}
              onChange={(event) => patch({ userId: event.target.value })}
              className={cn(CONTROL, "tabular-nums")}
            />
          </Labelled>

          <Toggle
            id="filter-guests"
            checked={draft.guestOnly}
            onChange={(checked) => patch({ guestOnly: checked })}
            label="Guest orders only"
            hint="Checkouts with no account behind them — where fraud review starts."
          />
        </Group>

        <Group label="Deleted orders">
          <Toggle
            id="filter-deleted"
            checked={draft.includeDeleted}
            onChange={(checked) => patch({ includeDeleted: checked })}
            label="Include deleted"
            hint="Soft-deleted orders are hidden from every listing by default."
          />
        </Group>
      </div>

      {/*
        * Pinned. The panel is taller than a phone and Apply is the only thing
        * that commits any of it - a button you have to scroll to find is one
        * people assume is not there, and they close the drawer instead.
        */}
      <SheetFooter className="sticky bottom-0 gap-3 border-t bg-popover">
        {resultCount !== null && !dirty ? (
          <p className="text-center text-xs text-muted-foreground">
            Matching {resultCount} order{resultCount === 1 ? "" : "s"}
          </p>
        ) : null}

        <div className="flex flex-row gap-2">
          <Button
            variant="outline"
            onClick={onClear}
            className="h-10 flex-1 cursor-pointer rounded-lg text-sm"
          >
            Clear all
          </Button>
          {/*
            * Closing without applying when nothing was staged, rather than
            * writing the same values back - `onChange` resets paging, so a
            * no-op Apply would bounce someone from page 3 to page 1 for
            * having opened the drawer and thought better of it.
            */}
          <Button
            onClick={() => (dirty ? onApply(draft) : onClose())}
            disabled={rangeBackwards || datesBackwards}
            className="h-10 flex-1 cursor-pointer rounded-lg text-sm font-semibold"
          >
            {dirty ? "Apply filters" : "Done"}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}

/* --------------------------------- pieces -------------------------------- */

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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

/**
 * A checkbox whose target is the whole row.
 *
 * The box is 16px; the sentence explaining it is most of the drawer's width.
 * Wrapping both in the `label` makes the explanation part of the control, so a
 * tap anywhere on the card toggles it - and it does so through the native
 * label association rather than a click handler, which keeps the keyboard and
 * screen-reader behaviour that a `div` with an `onClick` would throw away.
 */
function Toggle({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
        checked ? "border-primary/40 bg-primary/5" : "hover:bg-muted/50",
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        className="mt-0.5 cursor-pointer"
      />
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </span>
      </span>
    </label>
  );
}
