"use client";

/**
 * One order, with tracking as the headline.
 *
 * Someone opening this page has one question - where is my parcel - so the
 * tracker sits directly under the header, above the items and the address.
 * Everything else is reference material they scroll to.
 */

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ImageOff,
  Info,
  MapPin,
  PackageX,
  Phone,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPrice, humanise } from "@/lib/format";
import { whatsappLink } from "@/lib/config/site";
import { useOrder } from "@/hooks/use-orders";
import {
  formatOrderDate,
  statusBadgeClass,
  statusMeta,
} from "@/lib/orders/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/checkout/copy-button";
import { OrderTracker } from "./order-tracker";
import { SignedOutPrompt } from "./signed-out-prompt";

export function OrderDetailView({ id }: { id: number }) {
  const { order, isLoading, isAuthenticated } = useOrder(id);

  if (isLoading) return <DetailSkeleton />;

  if (!isAuthenticated) {
    return (
      <SignedOutPrompt
        title="Sign in to track this order"
        description="Orders are tied to an account, so we need to know this one is yours."
        next={`/orders/${id}`}
      />
    );
  }

  /*
   * `null` covers both "no such order" and "not yours" - the API answers 404
   * to each on purpose, because ids are sequential and confirming that an
   * order exists is itself information.
   */
  if (!order) return <NotFound />;

  const meta = statusMeta(order.status);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/orders"
        className="group inline-flex items-center gap-1.5 self-start rounded-field py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-brand-foreground dark:hover:text-brand"
      >
        <ArrowLeft
          className="size-4 transition-transform duration-200 group-hover:-translate-x-1"
          aria-hidden
        />
        All orders
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5 sm:p-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-xl font-bold tracking-tight tabular-nums sm:text-2xl">
              #{order.orderNumber}
            </h1>
            <CopyButton value={order.orderNumber} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Placed {formatOrderDate(order.placedAt)}
          </p>
        </div>

        <span
          className={cn(
            "rounded-full px-3.5 py-1.5 text-sm font-semibold",
            statusBadgeClass(order.status),
          )}
        >
          {meta.label}
        </span>
      </div>

      {/* The reason this page exists. */}
      <OrderTracker order={order} />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <section className="rounded-xl border bg-card p-5 sm:p-6">
          <h2 className="mb-4 text-sm font-semibold">
            {order.totalQuantity}{" "}
            {order.totalQuantity === 1 ? "item" : "items"}
          </h2>

          <ul className="divide-y">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                {/* No `overflow-hidden`: the count badge sits outside these
                    bounds and would be clipped. */}
                <span className="relative size-12 shrink-0 rounded-lg border bg-muted/30">
                  {item.thumbnail ? (
                    <Image
                      src={item.thumbnail}
                      alt=""
                      fill
                      sizes="48px"
                      className="rounded-lg object-contain p-1"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-muted-foreground">
                      <ImageOff className="size-4" aria-hidden />
                    </span>
                  )}
                  <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground tabular-nums">
                    {item.quantity}
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  {item.slug ? (
                    <Link
                      href={`/shop/${item.slug}`}
                      className="line-clamp-1 text-sm font-medium transition-colors hover:text-brand"
                    >
                      {item.name}
                    </Link>
                  ) : (
                    <span className="line-clamp-1 text-sm font-medium">
                      {item.name}
                    </span>
                  )}
                  {item.variantLabel ? (
                    <span className="block text-xs text-muted-foreground">
                      {humanise(item.variantLabel)}
                    </span>
                  ) : null}
                </span>

                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatPrice(item.lineTotal, order.currency)}
                </span>
              </li>
            ))}
          </ul>

          {/*
            * `subtotal` is already the amount charged and `discount` is the
            * saving against the struck-through prices - reported, not
            * deducted - so the pre-discount figure is the two added together.
            */}
          <dl className="mt-4 flex flex-col gap-2.5 border-t pt-4 text-sm">
            <Row
              label="Subtotal"
              value={formatPrice(order.subtotal + order.discount, order.currency)}
            />
            {order.discount > 0 ? (
              <Row
                label="Discount"
                value={`− ${formatPrice(order.discount, order.currency)}`}
                tone="success"
              />
            ) : null}
            <Row
              label="Delivery"
              value={
                order.shippingFee > 0
                  ? formatPrice(order.shippingFee, order.currency)
                  : "Free"
              }
              tone={order.shippingFee > 0 ? "default" : "success"}
            />
          </dl>

          <div className="mt-4 flex items-baseline justify-between border-t pt-4">
            <span className="text-sm font-semibold">
              {order.status === "DELIVERED" ? "Paid" : "Pay on delivery"}
            </span>
            <span className="font-heading text-2xl font-bold text-price">
              {formatPrice(order.total, order.currency)}
            </span>
          </div>
        </section>

        <div className="flex flex-col gap-6">
          <section className="rounded-xl border bg-card p-5 sm:p-6">
            <h2 className="mb-4 text-sm font-semibold">Delivering to</h2>
            <div className="flex flex-col gap-3 text-sm">
              <Detail icon={Phone}>
                <span className="font-medium">{order.contact.name}</span>
                <span className="block text-muted-foreground">
                  {order.contact.phone}
                </span>
              </Detail>

              <Detail icon={MapPin}>
                <span className="text-muted-foreground">
                  {[
                    order.shippingAddress.line1,
                    order.shippingAddress.line2,
                    order.shippingAddress.area,
                    order.shippingAddress.city,
                    order.shippingAddress.district,
                    order.shippingAddress.postalCode,
                    order.shippingAddress.country,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </Detail>

              <Detail icon={Wallet}>
                <span className="text-muted-foreground">
                  Cash on delivery · {order.paymentStatus === "PAID" ? "Paid" : "Due"}
                </span>
              </Detail>

              {order.note ? (
                <Detail icon={Info}>
                  <span className="text-muted-foreground">“{order.note}”</span>
                </Detail>
              ) : null}
            </div>
          </section>

          <Button
            variant="outline"
            className="h-12 w-full shrink-0 cursor-pointer gap-2 rounded-field text-sm font-semibold"
            render={
              <a
                href={whatsappLink(
                  `Hi, I have a question about order #${order.orderNumber}.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            Ask about this order
          </Button>
        </div>
      </div>
    </div>
  );
}

function Detail({
  icon: Icon,
  children,
}: {
  icon: typeof Phone;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={tone === "success" ? "font-medium text-success" : "font-medium"}
      >
        {value}
      </dd>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-20 text-center">
      <span className="mb-5 flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <PackageX className="size-8" aria-hidden />
      </span>
      <h1 className="font-heading text-xl font-bold tracking-tight lg:text-2xl">
        We could not find that order
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        It may belong to a different account, or the link may be wrong.
      </p>
      <Button
        className="mt-7 h-12 cursor-pointer rounded-field px-6 text-sm font-semibold"
        render={<Link href="/orders" />}
      >
        View your orders
      </Button>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Skeleton className="h-80 w-full rounded-xl" />
        <div className="flex flex-col gap-6">
          <Skeleton className="h-52 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-field" />
        </div>
      </div>
    </div>
  );
}
