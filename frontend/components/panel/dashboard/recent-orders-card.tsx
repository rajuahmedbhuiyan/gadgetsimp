/**
 * The last handful of orders.
 *
 * Below 640px the table would need six columns in 375px, so it stops being a
 * table and becomes a list of rows - number and status on one line, customer
 * and total on the next. Same data, same order, no sideways scroll on a phone.
 */

import Link from "next/link";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPrice } from "@/lib/format";
import { formatOrderDate, statusBadgeClass, statusMeta } from "@/lib/orders/status";
import { DEMO_CURRENCY, recentOrders } from "@/lib/panel/demo-data";
import { cn } from "@/lib/utils";

export function RecentOrdersCard() {
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
        {/* Phone: one card-row per order. */}
        <ul className="flex flex-col divide-y sm:hidden">
          {recentOrders.map((order) => (
            <li key={order.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium tabular-nums">
                  #{order.orderNumber}
                </span>
                <StatusPill status={order.status} />
              </div>
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span className="truncate">
                  {order.customer} · {order.city}
                </span>
                <span className="shrink-0 font-medium text-foreground tabular-nums">
                  {formatPrice(order.total, DEMO_CURRENCY)}
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
                    <span className="block max-w-40 truncate">
                      {order.customer}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {order.city}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {formatOrderDate(order.placedAt)}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={order.status} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPrice(order.total, DEMO_CURRENCY)}
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
