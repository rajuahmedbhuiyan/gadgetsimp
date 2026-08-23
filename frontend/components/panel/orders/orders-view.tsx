"use client";

/**
 * The orders screen.
 *
 * Filter state lives in the URL, so a filtered queue is something staff can
 * bookmark or paste into a message - "the six pending orders over ৳20,000"
 * rather than "search, then set two more things".
 *
 * Everything `POST /admin/orders/filter` accepts is reachable from here, and
 * nothing it does not: the body is `.strict()`, so an invented key would be a
 * 422 rather than an ignored field. The same goes for what the rows offer -
 * the status menu is built from `ORDER_STATUS_FLOW`, so it can only ever
 * propose a move the API will accept.
 *
 * Two gates, because the API has two. Working the queue is moderator-level;
 * both deletes are admin-and-above, which is why they are absent rather than
 * disabled for a moderator - a control that answers 403 is worse than no
 * control.
 */

import { useEffect, useState } from "react";
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from "nuqs";
import { PackageSearch, ReceiptText, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  type AdminOrder,
  type AdminOrderQuery,
  type OrderStatusName,
  type PaymentMethod,
  type UpdateOrderDetailsPayload,
} from "@/lib/api/admin/orders";
import { orderPermissions } from "@/lib/panel/permissions";
import { useAuth } from "@/lib/auth/auth-context";
import {
  ORDERS_PAGE_SIZE,
  useAdminOrders,
  useChangeOrderStatus,
  useHardDeleteOrder,
  useSoftDeleteOrder,
  useUpdateOrderDetails,
} from "@/hooks/use-admin-orders";
import { PanelPageHeading } from "@/components/panel/page-heading";
import { Pager } from "@/components/panel/pager";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HardDeleteDialog, SoftDeleteDialog } from "./order-delete-dialogs";
import {
  ANY_DATE,
  ORDER_SORTS,
  OrderFilters,
  resolveDate,
  TODAY,
  type OrderFilterState,
} from "./order-filters";
import { OrderSheet } from "./order-sheet";
import {
  OrderStatusDialog,
  type PendingStatusChange,
} from "./order-status-dialog";
import { ORDER_STATUS_LABEL } from "./order-status-badge";
import { OrdersTable } from "./orders-table";

/**
 * How long the search box waits before it becomes a request.
 *
 * A six-digit order number is six keystrokes, and without this it is six
 * queries, six history writes and six chances for an earlier response to land
 * after a later one. Long enough to swallow a burst of typing, short enough
 * that a pause still feels like an answer.
 */
const SEARCH_DEBOUNCE_MS = 350;

/** `"1500"` -> `1500`; anything that is not a number at all -> `undefined`. */
function numeric(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * A `<input type="date">` gives a bare `YYYY-MM-DD`, which as an instant is
 * midnight - so a range whose end was today would exclude everything placed
 * today. The end of the range is pushed to the end of that day, and both are
 * built in local time because that is the day the person meant.
 */
function dayBoundary(value: string, edge: "start" | "end"): string | undefined {
  if (!value) return undefined;

  const date = new Date(
    `${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}`,
  );

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function OrdersView() {
  const { user } = useAuth();
  const permissions = orderPermissions(user);

  const [state, setQuery] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      status: parseAsArrayOf(parseAsString).withDefault([]),
      payment: parseAsString.withDefault(""),
      sort: parseAsString.withDefault("newest"),
      min: parseAsString.withDefault(""),
      max: parseAsString.withDefault(""),
      from: parseAsString.withDefault(TODAY),
      to: parseAsString.withDefault(TODAY),
      customer: parseAsString.withDefault(""),
      guests: parseAsBoolean.withDefault(false),
      deleted: parseAsBoolean.withDefault(false),
      // One-based, because a person reads this one. The API counts from zero;
      // the translation happens below and nowhere else.
      page: parseAsInteger.withDefault(1),
    },
    { history: "replace", shallow: true, clearOnDefault: true },
  );

  /*
   * The URL is hand-editable, and every one of these fields is a strict enum
   * on the API - `?status=whatever` would be a 422 rather than an ignored
   * value. Unknown entries are dropped here instead, so a mangled link shows
   * a wider list rather than an error.
   */
  const status = state.status.filter((entry): entry is OrderStatusName =>
    (ORDER_STATUSES as readonly string[]).includes(entry),
  );
  const paymentMethod = (PAYMENT_METHODS as readonly string[]).includes(
    state.payment,
  )
    ? (state.payment as PaymentMethod)
    : "";

  const chosen =
    ORDER_SORTS.find((option) => option.value === state.sort) ?? ORDER_SORTS[0];
  const pageIndex = Math.max(1, state.page) - 1;

  const query: AdminOrderQuery = {
    ...(state.q ? { search: state.q } : {}),
    ...(status.length > 0 ? { status } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(numeric(state.min) !== undefined
      ? { minTotal: numeric(state.min) }
      : {}),
    ...(numeric(state.max) !== undefined
      ? { maxTotal: numeric(state.max) }
      : {}),
    ...(dayBoundary(resolveDate(state.from), "start")
      ? { placedFrom: dayBoundary(resolveDate(state.from), "start") }
      : {}),
    ...(dayBoundary(resolveDate(state.to), "end")
      ? { placedTo: dayBoundary(resolveDate(state.to), "end") }
      : {}),
    ...(numeric(state.customer) !== undefined
      ? { userId: numeric(state.customer) }
      : {}),
    ...(state.guests ? { guestOnly: true } : {}),
    ...(state.deleted ? { includeDeleted: true } : {}),
    sort: { field: chosen.field, direction: chosen.direction },
    pagination: { page: pageIndex, limit: ORDERS_PAGE_SIZE },
  };

  const { orders, meta, isLoading, isFetching, isError, refetch } =
    useAdminOrders(query);

  /*
   * The box is driven from here rather than from the URL, so a keystroke
   * repaints the input immediately and only the settled value becomes a query.
   * One owner: `applyFilters` and `clearFilters` both write through this, and
   * the effect below is the only thing that puts a search term in the URL.
   */
  const [searchInput, setSearchInput] = useState(state.q);

  useEffect(() => {
    if (searchInput === state.q) return;

    const timer = setTimeout(() => {
      void setQuery({ q: searchInput || null, page: null });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchInput, state.q, setQuery]);

  const changeStatus = useChangeOrderStatus();
  const updateDetails = useUpdateOrderDetails();
  const softDelete = useSoftDeleteOrder();
  const hardDelete = useHardDeleteOrder();

  /*
   * The sheet tracks an id, not an order. Holding the object would freeze a
   * copy from before the last mutation; resolving it from the current list
   * means a status change re-renders the open sheet with the new state - and
   * a hard delete closes it, because the row it was showing is gone.
   */
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = orders.find((order) => order.id === selectedId) ?? null;

  const [pendingStatus, setPendingStatus] =
    useState<PendingStatusChange | null>(null);
  const [pendingSoftDelete, setPendingSoftDelete] = useState<AdminOrder | null>(
    null,
  );
  const [pendingHardDelete, setPendingHardDelete] = useState<AdminOrder | null>(
    null,
  );

  const filters: OrderFilterState = {
    // The unsettled value, so the box shows what was typed rather than what
    // has made it into the URL.
    search: searchInput,
    status,
    paymentMethod,
    sort: chosen.value,
    minTotal: state.min,
    maxTotal: state.max,
    placedFrom: state.from,
    placedTo: state.to,
    userId: state.customer,
    guestOnly: state.guests,
    includeDeleted: state.deleted,
  };

  /** A new filter restarts paging; page 3 of "all" is rarely page 3 of a search. */
  const applyFilters = (patch: Partial<OrderFilterState>) => {
    // Debounced, and therefore not part of the batch below.
    if (patch.search !== undefined) setSearchInput(patch.search);

    void setQuery({
      ...(patch.status !== undefined
        ? { status: patch.status.length > 0 ? patch.status : null }
        : {}),
      ...(patch.paymentMethod !== undefined
        ? { payment: patch.paymentMethod || null }
        : {}),
      ...(patch.sort !== undefined ? { sort: patch.sort } : {}),
      ...(patch.minTotal !== undefined ? { min: patch.minTotal || null } : {}),
      ...(patch.maxTotal !== undefined ? { max: patch.maxTotal || null } : {}),
      // An emptied box leaves that end open. `null` is not usable here: it
      // would restore the default, which is today.
      ...(patch.placedFrom !== undefined
        ? { from: patch.placedFrom || ANY_DATE }
        : {}),
      ...(patch.placedTo !== undefined
        ? { to: patch.placedTo || ANY_DATE }
        : {}),
      ...(patch.userId !== undefined ? { customer: patch.userId || null } : {}),
      ...(patch.guestOnly !== undefined
        ? { guests: patch.guestOnly || null }
        : {}),
      ...(patch.includeDeleted !== undefined
        ? { deleted: patch.includeDeleted || null }
        : {}),
      page: null,
    });
  };

  /**
   * Every control back to nothing - and that includes the day.
   *
   * `from`/`to` go to `ANY_DATE` rather than `null`, because `null` restores
   * the default and the default is today. Clearing to today would leave the
   * list bounded by the one filter the reader could not see, so on a quiet
   * morning the button would appear to do nothing at all.
   *
   * `sort` is in here too. It orders rather than narrows, so it earns no chip,
   * but "clear all" that leaves a screen sorted by lowest total is not what
   * anybody meant by all.
   */
  const clearFilters = () => {
    setSearchInput("");

    void setQuery({
      q: null,
      status: null,
      payment: null,
      sort: null,
      min: null,
      max: null,
      from: ANY_DATE,
      to: ANY_DATE,
      customer: null,
      guests: null,
      deleted: null,
      page: null,
    });
  };

  /*
   * Narrowed by something other than the status tabs.
   *
   * Status is counted separately because the screen arrives with one applied.
   * Folding it in here would make every fresh load look "filtered" and turn an
   * empty PENDING queue - which is good news - into "nothing matches your
   * filters", which reads like a mistake.
   */
  /** A day the reader picked - not the one the screen opens on, nor no day. */
  const pickedDay = (bound: string) => bound !== TODAY && bound !== ANY_DATE;

  const narrowed =
    Boolean(state.q) ||
    Boolean(paymentMethod) ||
    Boolean(state.min || state.max) ||
    pickedDay(state.from) ||
    pickedDay(state.to) ||
    Boolean(state.customer) ||
    state.guests;

  /** Still on the day the screen opens with, which needs its own empty copy. */
  const onToday = state.from === TODAY && state.to === TODAY;

  return (
    <>
      {/*
       * From `lg` up this screen is exactly one viewport tall and nothing but
       * the table scrolls.
       *
       * The shell is `min-h-svh` - a floor, not a ceiling - so a bounded
       * table plus a sticky head and foot summed to more than the viewport
       * and the *page* scrolled too. Two scrollbars for one list means the
       * table slides up under its own header and the rows you were reading
       * leave the screen.
       *
       * The height is exact rather than estimated: the sticky panel header is
       * `--h-header`, and `#panel-main` pads itself by `1.5rem` top and
       * bottom at this width.
       *
       * Below `lg` the cards go back to scrolling the page, which is what a
       * phone expects - and the head and foot stay sticky there for it.
       */}
      <div className="flex flex-col gap-4 lg:h-[calc(100svh-var(--h-header)-3rem)] lg:min-h-0">
        {/*
         * Title, search and status tabs ride along with the table.
         *
         * Negative margins take it to the edges of the shell's padding so the
         * blur covers the full width, and `top-header` parks it directly under
         * the panel header (`z-30`), which this must sit beneath.
         */}
        <div className="sticky top-header z-20 -mx-4 -mt-4 flex flex-col gap-3 border-b bg-background/95 px-4 pt-4 pb-3 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-lg sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
          <PanelPageHeading
            title="Orders"
            description="The queue, from placed to delivered."
            action={
              <Button
                variant="outline"
                onClick={() => void refetch()}
                disabled={isFetching}
                className="h-10 cursor-pointer gap-2 rounded-lg text-sm"
              >
                <RefreshCw
                  className={cn("size-4", isFetching && "animate-spin")}
                  aria-hidden
                />
                <span className="max-sm:sr-only">Refresh</span>
              </Button>
            }
          />

          <OrderFilters
            value={filters}
            onChange={applyFilters}
            onClear={clearFilters}
            // The whole matching set, not the page - "show 3 orders" would be a
            // lie on page 2 of 140.
            resultCount={meta?.total ?? null}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {isError ? (
            <Failed onRetry={() => void refetch()} />
          ) : isLoading ? (
            <TableSkeleton />
          ) : orders.length === 0 ? (
            <Empty
              narrowed={narrowed}
              onToday={onToday}
              statuses={status}
              onClear={clearFilters}
            />
          ) : (
            <>
              <OrdersTable
                orders={orders}
                permissions={permissions}
                busy={isFetching}
                onOpen={(order) => setSelectedId(order.id)}
                onChangeStatus={(order, next) =>
                  setPendingStatus({ order, status: next })
                }
                onSoftDelete={setPendingSoftDelete}
                onHardDelete={setPendingHardDelete}
              />

              {/*
               * Rides the bottom edge, like the search and tabs ride the top.
               * On a phone the card list is far taller than the viewport, and a
               * pager you have to reach the end of to use is one people scroll
               * past looking for. Negative margins take it to the edges of the
               * shell's padding so the blur covers the full width.
               */}
              <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t bg-background/95 px-4 py-3 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-lg sm:-mx-6 sm:-mb-6 sm:px-6">
                {meta ? (
                  <Pager
                    meta={meta}
                    shown={orders.length}
                    noun="orders"
                    onPageChange={(next) => void setQuery({ page: next + 1 })}
                  />
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      <OrderSheet
        order={selected}
        permissions={permissions}
        savingDetails={updateDetails.isPending}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onChangeStatus={(order, next) =>
          setPendingStatus({ order, status: next })
        }
        onSaveDetails={(order, patch: UpdateOrderDetailsPayload) =>
          updateDetails.mutate({ id: order.id, ...patch })
        }
        onSoftDelete={setPendingSoftDelete}
        onHardDelete={setPendingHardDelete}
      />

      <OrderStatusDialog
        pending={pendingStatus}
        saving={changeStatus.isPending}
        onClose={() => setPendingStatus(null)}
        onConfirm={(note) => {
          if (pendingStatus) {
            changeStatus.mutate({
              id: pendingStatus.order.id,
              status: pendingStatus.status,
              // Omitted rather than sent empty: the schema takes an optional
              // string, and `""` would fail the note requirement anyway.
              ...(note ? { note } : {}),
            });
          }
          setPendingStatus(null);
        }}
      />

      <SoftDeleteDialog
        order={pendingSoftDelete}
        onClose={() => setPendingSoftDelete(null)}
        onConfirm={(order) => {
          softDelete.mutate(order.id);
          setPendingSoftDelete(null);
        }}
      />

      <HardDeleteDialog
        order={pendingHardDelete}
        onClose={() => setPendingHardDelete(null)}
        onConfirm={(order) => {
          hardDelete.mutate(order.id);
          setPendingHardDelete(null);
          // Nothing left to show, and the sheet may well be open on it.
          if (selectedId === order.id) setSelectedId(null);
        }}
      />
    </>
  );
}

/* --------------------------------- states -------------------------------- */

/**
 * Several different nothings, which want different sentences.
 *
 * A quiet morning is not a failed search. Telling someone who has taken every
 * order today that "nothing matches your filters" is both wrong and faintly
 * insulting, and it hides the one useful next step - widen the day.
 */
function Empty({
  narrowed,
  onToday,
  statuses,
  onClear,
}: {
  narrowed: boolean;
  onToday: boolean;
  statuses: OrderStatusName[];
  onClear: () => void;
}) {
  const statusNames = statuses
    .map((status) => ORDER_STATUS_LABEL[status].toLowerCase())
    .join(" or ");

  const { title, body } = narrowed
    ? {
        title: "Nothing matches those filters",
        body: "Try a wider date range, or clear the filters and start again.",
      }
    : onToday
      ? {
          title:
            statuses.length > 0
              ? `No ${statusNames} orders today`
              : "No orders today",
          body: "The screen opens on today. Clear the filters to drop the date range, or widen it to look further back.",
        }
      : statuses.length > 0
        ? {
            title: `No ${statusNames} orders`,
            body: "Nothing is waiting in this part of the queue. Pick another status above, or clear the filters.",
          }
        : {
            title: "No orders yet",
            body: "When someone checks out, their order lands here.",
          };

  const searching = narrowed || onToday || statuses.length > 0;

  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {searching ? (
          <PackageSearch className="size-7" aria-hidden />
        ) : (
          <ReceiptText className="size-7" aria-hidden />
        )}
      </span>
      <h2 className="font-heading text-lg font-bold tracking-tight">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>

      {searching ? (
        <Button
          variant="outline"
          onClick={onClear}
          className="mt-6 h-10 cursor-pointer rounded-lg px-5 text-sm font-semibold"
        >
          Reset filters
        </Button>
      ) : null}
    </div>
  );
}

function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <h2 className="font-heading text-lg font-bold tracking-tight">
        Could not load orders
      </h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        The queue did not answer. This is usually a connection problem.
      </p>
      <Button
        variant="outline"
        onClick={onRetry}
        className="mt-6 h-10 cursor-pointer gap-2 rounded-lg px-5 text-sm font-semibold"
      >
        <RefreshCw className="size-4" aria-hidden />
        Try again
      </Button>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-xl border p-3"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-36" />
          </div>
          <Skeleton className="hidden h-4 w-32 sm:block" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="hidden h-6 w-24 rounded-full lg:block" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
