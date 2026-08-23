"use client";

/**
 * The blocks an order's detail is built from.
 *
 * Two surfaces show the same record - the row that expands in place, and the
 * sheet that opens beside it - and they must agree, because a total or an
 * address that reads differently in two places is worse than either. So the
 * presentation lives here once and both compose it; only the editing and the
 * dangerous buttons belong to the sheet alone.
 *
 * Between them these cover every field the staff shape carries. Nothing is
 * dropped for being ugly: the internal id, the reserved quantity and the
 * originating IP are all here, because the moment anyone needs them is the
 * moment something has gone wrong and guessing is expensive.
 */

import Image from "next/image";
import Link from "next/link";
import {
  ExternalLink,
  ImageOff,
  Mail,
  MapPin,
  Monitor,
  Phone,
  StickyNote,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { formatOrderDate, statusMeta } from "@/lib/orders/status";
import type { AdminOrder, OrderStatusName } from "@/lib/api/admin/orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ORDER_STATUS_LABEL,
  PaymentBadge,
  paymentMethodLabel,
} from "./order-status-badge";

/* ------------------------------ contacting ------------------------------- */

/**
 * Reaching the customer, in one tap.
 *
 * Every order in this shop is cash on delivery, which means the phone is the
 * whole workflow - confirming, chasing a failed delivery, arranging a return.
 * `tel:` hands off to the desk phone or the handset the person is already
 * holding; typing the number back in by eye is where the wrong-number calls
 * come from.
 *
 * Email is offered only when there is one. A guest checkout without an
 * account often has none at all, and a dead button is a small lie.
 */
function ContactActions({
  order,
  className,
}: {
  order: AdminOrder;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        variant="outline"
        className="h-9 cursor-pointer gap-1.5 rounded-lg px-3 text-sm"
        render={<a href={`tel:${order.contact.phone}`} />}
      >
        <Phone className="size-3.5" aria-hidden />
        Call
      </Button>

      {order.email ? (
        <Button
          variant="outline"
          className="h-9 cursor-pointer gap-1.5 rounded-lg px-3 text-sm"
          render={
            <a
              href={`mailto:${order.email}?subject=${encodeURIComponent(
                `Your order #${order.orderNumber}`,
              )}`}
            />
          }
        >
          <Mail className="size-3.5" aria-hidden />
          Email
        </Button>
      ) : null}
    </div>
  );
}

/* --------------------------------- items --------------------------------- */

/**
 * One card per line.
 *
 * An order line is six or seven separate facts - name, SKU, variant, unit
 * price, quantity, line total, the raw ids - and stacked flat they run into
 * the line below, so a two-item order reads as one fourteen-fact blob. A
 * border is the cheapest thing that says where one product ends.
 */
export function OrderItems({ order }: { order: AdminOrder }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {order.items.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-brand/40"
        >
          <span className="relative size-12 shrink-0 overflow-hidden rounded-lg border bg-muted/30">
            {item.thumbnail ? (
              <Image
                src={item.thumbnail}
                alt=""
                fill
                sizes="48px"
                className="object-contain p-1"
              />
            ) : (
              <span className="flex h-full items-center justify-center text-muted-foreground">
                <ImageOff className="size-4" aria-hidden />
              </span>
            )}
          </span>

          <div className="min-w-0 flex-1">
            {/*
              * Through to the catalogue entry, not the storefront page: the
              * person reading this is deciding whether to dispatch, and the
              * next thing they want is stock and price. `productId` survives
              * on the line for exactly this - the rest of the line is a frozen
              * copy and must never be re-read from the product.
              */}
            <Link
              href={`/admin/products/${item.productId}`}
              className="line-clamp-2 text-[0.9375rem] font-medium transition-colors hover:text-brand"
            >
              {item.name}
            </Link>

            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span>{item.sku ?? "No SKU"}</span>
              {item.variantLabel ? (
                <Badge variant="outline" className="h-5 font-normal">
                  {item.variantLabel}
                </Badge>
              ) : null}
              {item.reservedQuantity > 0 ? (
                <span>{item.reservedQuantity} reserved</span>
              ) : null}
            </p>

            {item.variantOptions &&
            Object.keys(item.variantOptions).length > 0 ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {Object.entries(item.variantOptions)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(" · ")}
              </p>
            ) : null}

            <p className="mt-1 text-sm tabular-nums">
              {item.quantity} × {formatPrice(item.unitPrice, order.currency)}
              {item.originalPrice && item.originalPrice > item.unitPrice ? (
                <span className="ml-1.5 text-muted-foreground line-through">
                  {formatPrice(item.originalPrice, order.currency)}
                </span>
              ) : null}
            </p>

            {/*
              * The frozen slug, pointed at the storefront - "what did the
              * customer actually see" is a question a complaint usually turns
              * on. It can 404: the slug is a copy taken at purchase, and the
              * product may have been renamed or archived since. That is the
              * honest answer rather than a reason to hide the link.
              */}
            {item.slug ? (
              <a
                href={`/shop/${item.slug}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-brand hover:underline"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                View on the shop
              </a>
            ) : null}

            {/*
              * The raw ids. Nobody reads these until they are reconciling a
              * line against a stock movement or a support thread, and then
              * nothing else will do.
              */}
            {/* <p className="mt-1 font-mono text-[0.6875rem] break-all text-muted-foreground/70">
              line {item.id} · product {item.productId}
              {item.variantId ? ` · variant ${item.variantId}` : ""}
            </p> */}
          </div>

          <p className="shrink-0 text-[0.9375rem] font-semibold whitespace-nowrap tabular-nums">
            {formatPrice(item.lineTotal, order.currency)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * The money.
 *
 * Read-only, and not because this screen chose that: no endpoint on the API
 * changes a price, a quantity or a total. An order is a record of what the
 * customer agreed to pay.
 */
export function OrderTotals({ order }: { order: AdminOrder }) {
  return (
    <dl className="rounded-xl border bg-card p-3 text-sm">
      <div className="flex flex-col gap-2">
        <Money label="Subtotal" value={order.subtotal} currency={order.currency} />
        <Money
          label="Discount"
          value={-order.discount}
          currency={order.currency}
        />
        <Money
          label="Delivery"
          value={order.shippingFee}
          currency={order.currency}
        />
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t pt-3">
        <dt className="font-semibold">Total</dt>
        <dd className="text-xl font-bold tabular-nums">
          {formatPrice(order.total, order.currency)}
        </dd>
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {order.totalQuantity} item{order.totalQuantity === 1 ? "" : "s"} across{" "}
        {order.itemCount} line{order.itemCount === 1 ? "" : "s"} ·{" "}
        {paymentMethodLabel(order.paymentMethod)}
      </p>
    </dl>
  );
}

function Money({
  label,
  value,
  currency,
}: {
  label: string;
  value: number;
  currency: string;
}) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatPrice(value, currency)}</dd>
    </div>
  );
}

/* -------------------------------- delivery ------------------------------- */

/**
 * Where it goes and who to ask about it.
 *
 * Tiles rather than a paragraph. Each fact is separately actionable - one gets
 * called, one gets pasted into a courier form, one gets read out - and running
 * them together as lines of text means finding the right one by scanning past
 * the others every time.
 */
export function DeliveryBlock({ order }: { order: AdminOrder }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Tile icon={User} label="Customer">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{order.contact.name}</span>
            {order.isGuestOrder ? (
              <Badge variant="outline" className="h-5 font-normal">
                Guest
              </Badge>
            ) : null}
          </span>
        </Tile>

        <Tile icon={Phone} label="Phone">
          <a
            href={`tel:${order.contact.phone}`}
            className="font-medium tabular-nums transition-colors hover:text-brand"
          >
            {order.contact.phone}
          </a>
        </Tile>

        <Tile icon={Mail} label="Email" className="sm:col-span-2">
          {order.email ? (
            <a
              href={`mailto:${order.email}`}
              className="font-medium break-all transition-colors hover:text-brand"
            >
              {order.email}
            </a>
          ) : (
            <span className="text-muted-foreground">None on this order</span>
          )}
        </Tile>

        <Tile icon={MapPin} label="Deliver to" className="sm:col-span-2">
          <span className="leading-relaxed">{formatAddress(order)}</span>
        </Tile>
      </div>

      {order.note ? (
        <p className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/8 p-3 text-sm leading-relaxed">
          <StickyNote
            className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning"
            aria-hidden
          />
          <span>
            <span className="block text-xs font-semibold tracking-wide uppercase">
              Customer note
            </span>
            <span className="mt-0.5 block">{order.note}</span>
          </span>
        </p>
      ) : null}

      <ContactActions order={order} />
    </div>
  );
}

/** One line, skipping the parts this address does not have. */
export function formatAddress(order: AdminOrder) {
  const address = order.shippingAddress;

  return [
    address.line1,
    address.line2,
    address.area,
    address.city,
    address.district,
    address.postalCode,
    address.country,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

/* -------------------------------- history -------------------------------- */

/**
 * Appended, never rewritten - which is what makes it worth showing. Newest
 * first, because the last thing that happened is the thing being asked about.
 *
 * Drawn as a thread rather than a list: the point of a history is that each
 * entry followed the one under it, and a stack of separate rows says only that
 * several things happened.
 *
 * `changedBy` is a staff account id rather than a name - the API presents the
 * raw `Number` ref without populating it. `null` means nobody did it by hand;
 * the first PENDING event is written by the checkout itself.
 */
export function StatusHistory({ order }: { order: AdminOrder }) {
  const events = [...order.statusHistory].reverse();

  return (
    <ol className="flex flex-col">
      {events.map((event, index) => {
        const Icon = statusMeta(event.status).icon;
        const last = index === events.length - 1;

        return (
          <li
            key={`${event.status}-${event.changedAt}-${index}`}
            className="relative flex gap-3 pb-4 last:pb-0"
          >
            {/* The thread, stopping at the final marker rather than trailing
                off past it. */}
            {last ? null : (
              <span
                aria-hidden
                className="absolute top-8 bottom-0 left-[15px] w-px bg-border"
              />
            )}

            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border",
                index === 0
                  ? "border-brand/40 bg-brand/15 text-brand-foreground dark:text-brand"
                  : "bg-card text-muted-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-semibold">
                {ORDER_STATUS_LABEL[event.status as OrderStatusName] ??
                  event.status}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatOrderDate(event.changedAt)}
                {event.changedBy != null
                  ? ` · by staff #${event.changedBy}`
                  : " · placed by the customer"}
              </p>
              {event.note ? (
                <p className="mt-1.5 rounded-lg border bg-card px-3 py-2 text-sm leading-relaxed">
                  {event.note}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------------- record -------------------------------- */

/** The bookkeeping: ids, payment, stock, and every timestamp on the record. */
export function OrderFacts({ order }: { order: AdminOrder }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <Tile label="Payment">
        <span className="flex flex-wrap items-center gap-2">
          <PaymentBadge status={order.paymentStatus} />
          <span className="text-muted-foreground">
            {paymentMethodLabel(order.paymentMethod)}
          </span>
        </span>
      </Tile>

      <Tile label="Customer account">
        {order.userId != null ? (
          <span className="font-medium tabular-nums">#{order.userId}</span>
        ) : (
          <span className="text-muted-foreground">Guest checkout</span>
        )}
      </Tile>

      <Tile label="Reserved stock">
        <span
          className={cn(
            "font-medium",
            order.stockReleased ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {order.stockReleased ? "Released" : "Still held"}
        </span>
      </Tile>

      <Tile label="Last touched by">
        {order.updatedBy != null ? (
          <span className="font-medium tabular-nums">
            Staff #{order.updatedBy}
          </span>
        ) : (
          <span className="text-muted-foreground">Nobody yet</span>
        )}
      </Tile>

      {/* The path parameter, not the number the customer quotes. Worth having
          when reading a log line or building a link by hand. */}
      <Tile label="Internal ID">
        <span className="font-mono tabular-nums">{order.id}</span>
      </Tile>

      <Tile label="Placed">{formatOrderDate(order.placedAt)}</Tile>
      <Tile label="Created">{formatOrderDate(order.createdAt)}</Tile>
      <Tile label="Updated">{formatOrderDate(order.updatedAt)}</Tile>

      {order.deletedAt ? (
        <Tile label="Deleted" className="sm:col-span-2">
          <span className="font-medium text-destructive">
            {formatOrderDate(order.deletedAt)}
          </span>
        </Tile>
      ) : null}
    </div>
  );
}

/**
 * Where the order came from.
 *
 * Evidence, not identity: every field is client-supplied or derived from
 * client-supplied text, and none of it authorises anything. It is here so a
 * complaint or a run of fraudulent orders has something to correlate on.
 */
export function ClientFacts({ order }: { order: AdminOrder }) {
  if (!order.client) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Tile label="IP address">
          <span className="font-mono tabular-nums">
            {order.client.ip ?? "—"}
          </span>
        </Tile>
        <Tile label="Device">{order.client.device ?? "—"}</Tile>
        <Tile label="Operating system">{order.client.os ?? "—"}</Tile>
        <Tile label="Browser">{order.client.browser ?? "—"}</Tile>
      </div>

      {order.client.userAgent ? (
        <p className="flex items-start gap-2.5 rounded-xl border bg-card p-3 text-xs leading-relaxed break-all text-muted-foreground">
          <Monitor className="mt-0.5 size-4 shrink-0" aria-hidden />
          {order.client.userAgent}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One labelled fact in a box of its own.
 *
 * The label sits above the value rather than beside it, so the values line up
 * down the column and can be read without the labels once you know the shape -
 * which is what reading the same screen fifty times a day turns into.
 */
function Tile({
  icon: Icon,
  label,
  className,
  children,
}: {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl border bg-card p-3", className)}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
        {label}
      </p>
      <div className="mt-1 min-w-0 text-sm">{children}</div>
    </div>
  );
}
