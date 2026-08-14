"use client";

/**
 * The customer's own orders.
 *
 * Signed-in only - unlike the cart and checkout, there is no local equivalent:
 * a guest order exists on the server but is not attached to anyone, so there
 * is nothing to list until they have an account.
 *
 * The status filter lives in the URL through `nuqs`, so a filtered list is
 * shareable, survives a refresh, and puts Back where the shopper expects it.
 */

import Image from "next/image";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { ChevronLeft, ChevronRight, ImageOff, PackageSearch } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import type { OrderStatus } from "@/lib/api/orders";
import { useOrders } from "@/hooks/use-orders";
import {
  formatOrderDate,
  statusBadgeClass,
  statusMeta,
} from "@/lib/orders/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SignedOutPrompt } from "./signed-out-prompt";

const FILTERS: { value: OrderStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Placed" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "OUT_FOR_DELIVERY", label: "On the way" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELED", label: "Canceled" },
];

export function OrdersView() {
  const [{ status, page }, setQuery] = useQueryStates({
    status: parseAsString.withDefault("ALL"),
    page: parseAsInteger.withDefault(0),
  });

  const { orders, meta, isLoading, isFetching, isAuthenticated } = useOrders({
    status: status as OrderStatus | "ALL",
    page,
  });

  if (!isLoading && !isAuthenticated) {
    return (
      <SignedOutPrompt
        title="Sign in to see your orders"
        description="Your orders are tied to your account, so we need to know who you are."
        next="/orders"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Filter orders" className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {FILTERS.map((filter) => {
            const active = status === filter.value;
            return (
              <li key={filter.value}>
                <button
                  type="button"
                  aria-current={active}
                  // A new filter restarts paging; page 3 of "All" is rarely
                  // page 3 of "Delivered".
                  onClick={() =>
                    setQuery({ status: filter.value, page: 0 })
                  }
                  className={cn(
                    "cursor-pointer rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "border-brand bg-brand/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-brand/40 hover:text-foreground",
                  )}
                >
                  {filter.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {isLoading ? (
        <OrdersSkeleton />
      ) : orders.length === 0 ? (
        <Empty filtered={status !== "ALL"} />
      ) : (
        <>
          <ul className={cn("flex flex-col gap-4", isFetching && "opacity-60")}>
            {orders.map((order) => {
              const meta = statusMeta(order.status);
              const Icon = meta.icon;

              return (
                <li key={order.id}>
                  <Link
                    href={`/orders/${order.id}`}
                    className="group block rounded-xl border bg-card p-4 transition-all hover:border-brand/40 hover:shadow-card sm:p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-full",
                            statusBadgeClass(order.status),
                          )}
                        >
                          <Icon className="size-4.5" aria-hidden />
                        </span>
                        <div>
                          <p className="text-sm font-semibold transition-colors group-hover:text-brand">
                            #{order.orderNumber}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatOrderDate(order.placedAt)}
                          </p>
                        </div>
                      </div>

                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold",
                          statusBadgeClass(order.status),
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-4 border-t pt-4">
                      {/* A strip of thumbnails says what the order was faster
                          than a line of product names would. */}
                      <ul className="flex -space-x-2">
                        {order.items.slice(0, 4).map((item) => (
                          <li
                            key={item.id}
                            className="relative size-10 shrink-0 rounded-lg border bg-card"
                          >
                            {item.thumbnail ? (
                              <Image
                                src={item.thumbnail}
                                alt=""
                                fill
                                sizes="40px"
                                className="rounded-lg object-contain p-1"
                              />
                            ) : (
                              <span className="flex h-full items-center justify-center text-muted-foreground">
                                <ImageOff className="size-3.5" aria-hidden />
                              </span>
                            )}
                          </li>
                        ))}
                        {order.items.length > 4 ? (
                          <li className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted text-xs font-semibold">
                            +{order.items.length - 4}
                          </li>
                        ) : null}
                      </ul>

                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {order.totalQuantity}{" "}
                          {order.totalQuantity === 1 ? "item" : "items"}
                        </p>
                        <p className="text-sm font-bold text-price">
                          {formatPrice(order.total, order.currency)}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {meta && meta.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-4">
              <Button
                variant="outline"
                className="h-10 cursor-pointer gap-1.5 rounded-field px-4 text-sm"
                disabled={!meta.hasPrevPage}
                onClick={() => setQuery({ page: page - 1 })}
              >
                <ChevronLeft className="size-4" aria-hidden />
                Previous
              </Button>

              <span className="text-sm text-muted-foreground tabular-nums">
                Page {meta.page + 1} of {meta.totalPages}
              </span>

              <Button
                variant="outline"
                className="h-10 cursor-pointer gap-1.5 rounded-field px-4 text-sm"
                disabled={!meta.hasNextPage}
                onClick={() => setQuery({ page: page + 1 })}
              >
                Next
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Empty({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-20 text-center">
      <span className="mb-5 flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <PackageSearch className="size-8" aria-hidden />
      </span>
      <h2 className="font-heading text-xl font-bold tracking-tight">
        {filtered ? "Nothing with that status" : "No orders yet"}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "Try another filter, or view all of your orders."
          : "When you place an order it will appear here, with live tracking."}
      </p>
      <Button
        className="mt-7 h-12 cursor-pointer rounded-field px-6 text-sm font-semibold"
        render={<Link href="/shop" />}
      >
        Start shopping
      </Button>
    </div>
  );
}

function OrdersSkeleton() {
  return (
    <ul className="flex flex-col gap-4">
      {Array.from({ length: 3 }, (_, index) => (
        <li key={index} className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <div className="flex gap-2">
              {Array.from({ length: 3 }, (_, n) => (
                <Skeleton key={n} className="size-10 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        </li>
      ))}
    </ul>
  );
}
