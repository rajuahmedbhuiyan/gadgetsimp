/**
 * Where the queue is sitting.
 *
 * Rows with a track rather than a pie: six slices, several of them tiny, is
 * exactly the case a doughnut cannot be read at. Each row carries its own
 * status colour - these are the app's status tokens, the same ones the
 * storefront's order badges use, so a status means one colour everywhere - and
 * the count is written out beside it, never left to the bar alone.
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
import type { DashboardStatusCount } from "@/lib/api/admin/dashboard";
import { statusMeta } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

/** The bar's fill, per status tone. The track stays neutral underneath it. */
const TONE_FILL: Record<string, string> = {
  pending: "bg-muted-foreground/60",
  progress: "bg-chart-1",
  success: "bg-success",
  danger: "bg-destructive",
};

export function OrderPipeline({
  ordersByStatus,
}: {
  ordersByStatus: DashboardStatusCount[];
}) {
  const total = ordersByStatus.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card className="min-w-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>Orders by status</CardTitle>
        <CardDescription>{total.toLocaleString("en-US")} in total</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/admin/orders" />}
          >
            Open queue
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-3.5">
        {ordersByStatus.map((row) => {
          const meta = statusMeta(row.status);
          const share = total > 0 ? row.count / total : 0;

          return (
            <div key={String(row.status)} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-sm">
                  <meta.icon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  {meta.label}
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {row.count.toLocaleString("en-US")}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {total > 0 ? Math.round(share * 100) : 0}%
                  </span>
                </span>
              </div>

              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="presentation"
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    TONE_FILL[meta.tone] ?? "bg-muted-foreground/60",
                  )}
                  style={{ width: `${Math.max(share * 100, 1.5)}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
