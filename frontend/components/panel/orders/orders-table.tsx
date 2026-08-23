"use client";

/**
 * The order queue, in two shapes.
 *
 * Same reasoning as the products table: below `lg` a ten-column table shrinks
 * past readability, so the same rows render as cards on a phone and as a table
 * on a desktop, from one set of data and one set of handlers.
 *
 * **Everything needed to act on an order is in the row.** Who it is going to,
 * where, the two ways to reach them, what it costs, how it is paid, where it
 * was placed from, and the way in to the full record. Working a queue means
 * scanning it, and a fact that costs a click is a fact nobody scans - so the
 * row is wide and scrolls sideways rather than hiding half of itself. Expanding
 * is only ever "what is actually in this parcel".
 *
 * The row reports intent only. Whether marking something RETURNED needs a note
 * first, and what a delete confirmation should say, are decisions the screen
 * above owns - which keeps the note requirement in one place rather than in
 * every menu that can reach a negative status.
 */

import { Fragment, useState } from "react";
import {
  ChevronDown,
  Eye,
  Mail,
  MapPin,
  MessageSquareText,
  MoreHorizontal,
  Phone,
  StickyNote,
  Trash2,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { formatOrderDate } from "@/lib/orders/status";
import type { AdminOrder, OrderStatusName } from "@/lib/api/admin/orders";
import type { OrderPermissions } from "@/lib/panel/permissions";
import { PanelMenuBackdrop } from "@/components/panel/menu-backdrop";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAddress, OrderItems } from "./order-detail-panels";
import { PaymentBadge, paymentMethodLabel } from "./order-status-badge";
import { OrderStatusMenu } from "./order-status-menu";

export interface OrdersTableProps {
  orders: AdminOrder[];
  permissions: OrderPermissions;
  busy: boolean;
  onOpen: (order: AdminOrder) => void;
  onChangeStatus: (order: AdminOrder, status: OrderStatusName) => void;
  onSoftDelete: (order: AdminOrder) => void;
  onHardDelete: (order: AdminOrder) => void;
}

export function OrdersTable(props: OrdersTableProps) {
  /*
   * Several at once, because the reason to expand two rows is usually to
   * compare them. Held here rather than in the URL: which rows are open is a
   * reading position, not a filter worth sharing.
   */
  const [expanded, setExpanded] = useState<number[]>([]);

  const toggle = (id: number) =>
    setExpanded((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );

  return (
    <>
      {/* Takes the height the screen has left, rather than asking for a
          guessed slice of the viewport. */}
      <div className="hidden min-h-0 flex-1 lg:block">
        <DesktopTable {...props} expanded={expanded} onToggle={toggle} />
      </div>
      <div className="flex flex-col gap-3 lg:hidden">
        {props.orders.map((order) => (
          <MobileCard
            key={order.id}
            order={order}
            expanded={expanded.includes(order.id)}
            onToggle={() => toggle(order.id)}
            {...props}
          />
        ))}
      </div>
    </>
  );
}

/* -------------------------------- desktop -------------------------------- */

function DesktopTable({
  orders,
  busy,
  expanded,
  onToggle,
  ...rest
}: OrdersTableProps & {
  expanded: number[];
  onToggle: (id: number) => void;
}) {
  return (
    /*
     * Scrolls sideways rather than dropping columns. Ten columns is a lot, but
     * every one is something the person working the queue would otherwise have
     * to open an order to find out, and a scrollbar is a cheaper price.
     *
     * The bounded height is also what makes the header stick. `Table` wraps
     * itself in its own `overflow-x-auto` container, and that container is the
     * nearest scroll ancestor a sticky `thead` resolves against - so without a
     * definite height there it has nothing to stick to and the rule silently
     * does nothing. Reaching in to size that element is the price of not
     * forking the shared component.
     */
    <div
      className={cn(
        "h-full rounded-xl border",
        "[&>[data-slot=table-container]]:h-full",
        "[&>[data-slot=table-container]]:overflow-auto",
        busy && "opacity-60",
      )}
    >
      {/* The shared table's cells are `px-2`, which is right for a compact
          grid and too tight for ten columns of prose. */}
      <Table className="min-w-[1240px] [&_td]:px-4 [&_th]:px-4">
        {/* Opaque, not `bg-muted/40`: rows scroll under it. */}
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow className="bg-muted hover:bg-muted">
            <TableHead className="w-12">
              <span className="sr-only">Expand</span>
            </TableHead>
            <TableHead className="min-w-40 text-sm">Order</TableHead>
            <TableHead className="min-w-56 text-sm">Customer</TableHead>
            <TableHead className="min-w-60 text-sm">Deliver to</TableHead>
            <TableHead className="text-center text-sm">Items</TableHead>
            <TableHead className="text-right text-sm">Total</TableHead>
            <TableHead className="text-sm">Payment</TableHead>
            <TableHead className="text-sm">Status</TableHead>
            <TableHead className="min-w-32 text-sm">Placed from</TableHead>
            <TableHead className="w-36">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {orders.map((order) => {
            const isOpen = expanded.includes(order.id);

            return (
              /* The key belongs on the fragment: a row and its detail are two
                 siblings of one list entry, not two entries. */
              <Fragment key={order.id}>
                <TableRow
                  className={cn(
                    order.deletedAt && "opacity-55",
                    /*
                     * Two tones, not one. The row you clicked is the darker of
                     * the pair and the panel below it is lighter, so the eye
                     * reads "this row, and its contents" rather than one block
                     * of shading whose top edge could be anywhere. The shared
                     * bottom border goes, which is what joins them.
                     */
                    isOpen &&
                      "border-b-0 bg-muted hover:bg-muted",
                  )}
                >
                  <TableCell className="align-top">
                    <ExpandButton
                      order={order}
                      open={isOpen}
                      onToggle={() => onToggle(order.id)}
                    />
                  </TableCell>

                  <TableCell className="align-top">
                    <OrderCell order={order} onOpen={rest.onOpen} />
                  </TableCell>

                  <TableCell className="align-top">
                    <CustomerCell order={order} />
                  </TableCell>

                  <TableCell className="align-top">
                    <AddressCell order={order} />
                  </TableCell>

                  <TableCell className="text-center align-top text-[0.9375rem] tabular-nums">
                    <span className="font-medium">{order.totalQuantity}</span>
                    {order.itemCount !== order.totalQuantity ? (
                      <span className="text-muted-foreground">
                        {" "}
                        / {order.itemCount}
                      </span>
                    ) : null}
                  </TableCell>

                  <TableCell className="text-right align-top text-[0.9375rem] font-semibold whitespace-nowrap tabular-nums">
                    {formatPrice(order.total, order.currency)}
                  </TableCell>

                  <TableCell className="align-top">
                    <div className="flex flex-col items-start gap-1">
                      <PaymentBadge status={order.paymentStatus} />
                      <span className="text-sm whitespace-nowrap text-muted-foreground">
                        {paymentMethodLabel(order.paymentMethod)}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="align-top">
                    <div className="flex flex-col items-start gap-1.5">
                      <OrderStatusMenu
                        order={order}
                        permissions={rest.permissions}
                        onChangeStatus={rest.onChangeStatus}
                      />
                      <StatusNote order={order} />
                    </div>
                  </TableCell>

                  <TableCell className="align-top">
                    <OriginCell order={order} />
                  </TableCell>

                  <TableCell className="align-top">
                    <RowActions order={order} {...rest} />
                  </TableCell>
                </TableRow>

                {isOpen ? (
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={10} className="p-0">
                      {/*
                        * Capped rather than stretched across ten columns. An
                        * item line is a name, a price and a thumbnail - laying
                        * that out 1200px wide puts the price a screen away
                        * from the product it belongs to, which is the one
                        * pairing the reader is here to make.
                        */}
                      <div className="max-w-[660px] border-t p-4">
                        <h3 className="mb-3 font-heading text-sm font-bold tracking-tight">
                          Items ({order.itemCount})
                        </h3>
                        <OrderItems order={order} />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/* --------------------------------- mobile -------------------------------- */

/**
 * The same order, built for a phone rather than squeezed into one.
 *
 * The table's cells are shaped by their columns - a header says what each one
 * is, and alignment does the rest. Strip the columns away and those same cells
 * become a stack of unlabelled fragments, which is what made the first version
 * of this card hard to read.
 *
 * So this is its own layout: banded sections in the order the questions get
 * asked - which order, what state, who and where, how much, what is in it -
 * each labelled, with the two things anyone does about an order (call them,
 * open it) as real buttons rather than inferred from an icon.
 */
function MobileCard({
  order,
  expanded,
  onToggle,
  busy,
  ...rest
}: {
  order: AdminOrder;
  expanded: boolean;
  onToggle: () => void;
} & OrdersTableProps) {
  const note = order.statusHistory.at(-1)?.note?.trim();

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border bg-card",
        busy && "opacity-60",
        order.deletedAt && "opacity-55",
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b p-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => rest.onOpen(order)}
              className="cursor-pointer text-xl font-bold tabular-nums transition-colors hover:text-brand"
            >
              #{order.orderNumber}
            </button>
            {order.deletedAt ? (
              <Badge variant="destructive" className="font-normal">
                Deleted
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatOrderDate(order.placedAt)}
          </p>
        </div>

        <RowActions order={order} {...rest} />
      </div>

      <div className="flex flex-col gap-2 border-b bg-muted/30 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusMenu
            order={order}
            permissions={rest.permissions}
            onChangeStatus={rest.onChangeStatus}
          />
          <PaymentBadge status={order.paymentStatus} />
        </div>
        {note ? (
          <p className="flex items-start gap-1.5 text-sm leading-relaxed text-muted-foreground">
            <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{note}</span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2.5 border-b p-3">
        <CardLine icon={User} label="Customer">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{order.contact.name}</span>
            {order.isGuestOrder ? (
              <Badge variant="outline" className="h-5 font-normal">
                Guest
              </Badge>
            ) : null}
          </span>
        </CardLine>

        <CardLine icon={Phone} label="Phone">
          <span className="tabular-nums">{order.contact.phone}</span>
        </CardLine>

        {order.email ? (
          <CardLine icon={Mail} label="Email">
            <span className="break-all">{order.email}</span>
          </CardLine>
        ) : null}

        <CardLine icon={MapPin} label="Deliver to">
          {formatAddress(order)}
        </CardLine>

        {order.note ? (
          <CardLine icon={StickyNote} label="Customer note">
            {order.note}
          </CardLine>
        ) : null}

        {/* Cash on delivery makes the phone the whole workflow, so it is a
            button on the card rather than an icon to be found. */}
        <div className="mt-0.5 flex gap-2">
          <Button
            variant="outline"
            className="h-10 flex-1 cursor-pointer gap-2 rounded-lg text-sm font-semibold"
            render={<a href={`tel:${order.contact.phone}`} />}
          >
            <Phone className="size-4" aria-hidden />
            Call
          </Button>
          {order.email ? (
            <Button
              variant="outline"
              className="h-10 flex-1 cursor-pointer gap-2 rounded-lg text-sm font-semibold"
              render={
                <a
                  href={`mailto:${order.email}?subject=${encodeURIComponent(
                    `Your order #${order.orderNumber}`,
                  )}`}
                />
              }
            >
              <Mail className="size-4" aria-hidden />
              Email
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 p-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Total
          </p>
          <p className="text-2xl font-bold tabular-nums">
            {formatPrice(order.total, order.currency)}
          </p>
        </div>
        <p className="text-right text-sm text-muted-foreground">
          {order.totalQuantity} item{order.totalQuantity === 1 ? "" : "s"}
          <br />
          {paymentMethodLabel(order.paymentMethod)}
        </p>
      </div>

      {/* A labelled full-width row, not a bare chevron - what it opens was the
          thing the icon never said. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center justify-between border-t px-3 py-3 text-sm font-semibold transition-colors hover:bg-muted/50"
      >
        {expanded
          ? "Hide items"
          : `Show ${order.itemCount} item${order.itemCount === 1 ? "" : "s"}`}
        <ChevronDown
          aria-hidden
          className={cn("size-4.5 transition-transform", expanded && "rotate-180")}
        />
      </button>

      {expanded ? (
        <div className="border-t bg-muted/40 p-3">
          <OrderItems order={order} />
        </div>
      ) : null}
    </article>
  );
}

/** One labelled fact. The label is what the table got from its column header. */
function CardLine({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

/* --------------------------------- cells --------------------------------- */

function ExpandButton({
  order,
  open,
  onToggle,
}: {
  order: AdminOrder;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} the items in order ${order.orderNumber}`}
      title={open ? "Hide items" : "Show items"}
      className="size-9 cursor-pointer"
    >
      <ChevronDown
        aria-hidden
        className={cn("size-4.5 transition-transform", open && "rotate-180")}
      />
    </Button>
  );
}

function OrderCell({
  order,
  onOpen,
}: {
  order: AdminOrder;
  onOpen: (order: AdminOrder) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        {/*
          * The six-digit number, because that is what the customer on the
          * phone read out - the integer id is a path parameter, not something
          * anybody quotes.
          */}
        <button
          type="button"
          onClick={() => onOpen(order)}
          className="cursor-pointer text-base font-semibold tabular-nums transition-colors hover:text-brand"
        >
          #{order.orderNumber}
        </button>
        {order.deletedAt ? (
          <Badge variant="destructive" className="h-5 font-normal">
            Deleted
          </Badge>
        ) : null}
      </div>
      <p className="mt-0.5 text-sm whitespace-nowrap text-muted-foreground">
        {formatOrderDate(order.placedAt)}
      </p>
    </div>
  );
}

/**
 * Who it goes to, and both ways to reach them.
 *
 * Cash on delivery makes the phone the whole workflow - confirming, chasing a
 * failed delivery, arranging a return - so calling is one tap from the row
 * rather than something you copy a number out of. Email sits beside it when
 * the order has one; a guest checkout often does not, and a dead button is a
 * small lie.
 */
function CustomerCell({ order }: { order: AdminOrder }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="line-clamp-1 text-[0.9375rem] font-medium">
          {order.contact.name}
        </span>
        {order.isGuestOrder ? (
          <Badge variant="outline" className="h-5 shrink-0 font-normal">
            Guest
          </Badge>
        ) : null}
      </div>

      <a
        href={`tel:${order.contact.phone}`}
        className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand"
      >
        <Phone className="size-4 shrink-0" aria-hidden />
        <span className="tabular-nums">{order.contact.phone}</span>
      </a>

      {order.email ? (
        <a
          href={`mailto:${order.email}?subject=${encodeURIComponent(
            `Your order #${order.orderNumber}`,
          )}`}
          className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand"
        >
          <Mail className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{order.email}</span>
        </a>
      ) : (
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground/70">
          <Mail className="size-4 shrink-0" aria-hidden />
          No email
        </p>
      )}
    </div>
  );
}

/** Where it goes, plus whatever the customer told the rider. */
function AddressCell({ order }: { order: AdminOrder }) {
  return (
    <div className="min-w-0">
      <p className="flex items-start gap-1.5 text-sm leading-relaxed text-muted-foreground">
        <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="line-clamp-2" title={formatAddress(order)}>
          {formatAddress(order)}
        </span>
      </p>
      {order.note ? (
        <p className="mt-1 flex items-start gap-1.5 text-sm leading-relaxed">
          <StickyNote className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning" aria-hidden />
          <span className="line-clamp-2" title={order.note}>
            {order.note}
          </span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Why the order is where it is.
 *
 * The note on the **last** status change, which is the one that explains the
 * status showing next to it - "customer unreachable", "wrong size sent back".
 * The API demands one for RETURNED and CANCELED precisely because those are
 * the states anyone asks about later, and making someone open the order to
 * read it defeats the point of having required it.
 *
 * Deliberately not "the most recent note anywhere in the history": a reason
 * written when the order was cancelled is not an explanation of a state it has
 * since moved to, and showing it under a different badge would read as one.
 */
function StatusNote({ order }: { order: AdminOrder }) {
  const latest = order.statusHistory.at(-1);
  const note = latest?.note?.trim();

  if (!note) return null;

  return (
    <p
      className="flex min-w-0 items-start gap-1.5 text-sm leading-relaxed text-muted-foreground"
      title={note}
    >
      <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="line-clamp-2">{note}</span>
    </p>
  );
}

/**
 * The originating IP, and only that.
 *
 * Evidence, not identity - it authorises nothing. It earns a column because
 * the pattern it exists to catch is only visible across orders: the same
 * address under three different names is something you notice while scanning
 * and never by opening them one at a time. The device, OS and browser are the
 * same fact at lower resolution, so they stay in the record drawer rather than
 * spending a column each on something nobody scans for.
 */
function OriginCell({ order }: { order: AdminOrder }) {
  return (
    <p
      className="truncate font-mono text-sm tabular-nums text-muted-foreground"
      title={order.client?.ip ?? "No IP recorded"}
    >
      {order.client?.ip ?? "—"}
    </p>
  );
}

/**
 * Opening the record is a button, not a menu entry: it is the thing most often
 * wanted, and burying the common action under the same click as the
 * irreversible one is how the irreversible one gets picked by mistake.
 */
function RowActions({
  order,
  permissions,
  onOpen,
  onSoftDelete,
  onHardDelete,
}: { order: AdminOrder } & Omit<OrdersTableProps, "orders" | "busy">) {
  const [open, setOpen] = useState(false);
  const removable =
    (permissions.remove && !order.deletedAt) || permissions.destroy;

  return (
    <div className="flex items-center justify-end gap-0.5">
      {/*
        * Calling is the workflow, not a detail - cash on delivery means every
        * confirmation and every failed drop is a phone call. Email sits beside
        * it only when the order carries one; a guest checkout often does not,
        * and a dead button is a small lie.
        */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Call ${order.contact.name}`}
        title={`Call ${order.contact.phone}`}
        className="size-10 cursor-pointer"
        render={<a href={`tel:${order.contact.phone}`} />}
      >
        <Phone className="size-4.5" aria-hidden />
      </Button>

      {order.email ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Email ${order.email}`}
          title={order.email}
          className="size-10 cursor-pointer"
          render={
            <a
              href={`mailto:${order.email}?subject=${encodeURIComponent(
                `Your order #${order.orderNumber}`,
              )}`}
            />
          }
        >
          <Mail className="size-4.5" aria-hidden />
        </Button>
      ) : null}

      <Button
        variant="ghost"
        size="icon"
        onClick={() => onOpen(order)}
        aria-label={`Open order ${order.orderNumber}`}
        title="Open full record"
        className="size-10 cursor-pointer"
      >
        <Eye className="size-4.5" aria-hidden />
      </Button>

      {removable ? (
        <DropdownMenu open={open} onOpenChange={setOpen}>
          {open ? <PanelMenuBackdrop onClick={() => setOpen(false)} /> : null}
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`More actions for order ${order.orderNumber}`}
                className="size-10 cursor-pointer"
              />
            }
          >
            <MoreHorizontal className="size-4.5" aria-hidden />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => onOpen(order)}
                className="cursor-pointer"
              >
                <Eye aria-hidden />
                Open full record
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              {permissions.remove && !order.deletedAt ? (
                <DropdownMenuItem
                  onClick={() => onSoftDelete(order)}
                  className="cursor-pointer text-destructive data-highlighted:text-destructive"
                >
                  <Trash2 aria-hidden />
                  Delete order
                </DropdownMenuItem>
              ) : null}

              {permissions.destroy ? (
                <DropdownMenuItem
                  onClick={() => onHardDelete(order)}
                  className="cursor-pointer text-destructive data-highlighted:text-destructive"
                >
                  <Trash2 aria-hidden />
                  Delete permanently
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
