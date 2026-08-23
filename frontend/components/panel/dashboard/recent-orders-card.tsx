/**
 * The last handful of orders.
 *
 * Below 640px the table would need six columns in 375px, so it stops being a
 * table and becomes a list of rows - number and status on one line, customer
 * and total on the next. Same data, same order, no sideways scroll on a phone.
 */

import Link from "next/link";
import { Phone } from "lucide-react";

import { UserAvatar } from "@/components/auth/user-avatar";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DashboardRecentOrder } from "@/lib/api/admin/dashboard";
import { formatPrice } from "@/lib/format";
import { formatOrderDate, statusBadgeClass, statusMeta } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

export function RecentOrdersCard({
  currency,
  recentOrders,
}: {
  currency: string;
  recentOrders: DashboardRecentOrder[];
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>Recent orders</CardTitle>
        <CardDescription>The last six placed</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/admin/orders" />}
          >
            View all
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="min-w-0 px-0">
        {recentOrders.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No orders have been placed yet.
          </p>
        ) : null}

        {/* Phone: one card-row per order. */}
        <ul className="flex flex-col divide-y sm:hidden">
          {recentOrders.map((order) => (
            <li key={order.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <CustomerIdentity order={order} />
                <StatusPill status={order.status} />
              </div>
              <div className="ml-11 flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span className="truncate tabular-nums">
                  #{order.orderNumber} · {order.city}
                </span>
                <a
                  href={`tel:${phoneHref(order.phone)}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-medium text-foreground tabular-nums transition-colors hover:bg-muted"
                >
                  <Phone className="size-3.5" aria-hidden />
                  {order.phone}
                </a>
              </div>
              <div className="ml-11 flex items-center justify-end text-sm">
                <span className="font-medium text-foreground tabular-nums">
                  {formatPrice(order.total, currency)}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/* Tablet and up: the real table, still allowed to scroll sideways
            rather than squeeze the page. */}
        <div className="hidden min-w-0 overflow-x-auto sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden xl:table-cell">Phone</TableHead>
                <TableHead className="hidden lg:table-cell">Placed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium tabular-nums">
                    #{order.orderNumber}
                  </TableCell>
                  <TableCell>
                    <CustomerIdentity order={order} />
                  </TableCell>
                  <TableCell className="hidden max-w-56 xl:table-cell">
                    <PhoneLink phone={order.phone} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {formatOrderDate(order.placedAt)}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={order.status} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPrice(order.total, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function phoneHref(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function PhoneLink({ phone }: { phone: string }) {
  return (
    <a
      href={`tel:${phoneHref(phone)}`}
      className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium tabular-nums transition-colors hover:bg-muted"
    >
      <Phone className="size-4 text-muted-foreground" aria-hidden />
      {phone}
    </a>
  );
}

function CustomerIdentity({ order }: { order: DashboardRecentOrder }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar
        user={{ fullName: order.customer, image: order.customerImage }}
        className="size-8"
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{order.customer}</span>
          <Badge
            variant={order.isGuestOrder ? "outline" : "secondary"}
            className="h-5 shrink-0 px-1.5 text-[10px]"
          >
            {order.isGuestOrder ? "Guest" : "Account"}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {order.email ?? "No email"}
        </p>
      </div>
    </div>
  );
}

/** The storefront's status colours, so a status reads the same on both sides. */
function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
        statusBadgeClass(status),
      )}
    >
      {statusMeta(status).label}
    </span>
  );
}
