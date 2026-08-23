/**
 * What is about to run out.
 *
 * Sorted by how empty rather than by how many: three of fifteen is a worse
 * problem than eight of twelve, and the meter says so. Zero is called out in
 * words as well as colour - "Out of stock" - because a red bar on its own is
 * not a message.
 */

import Link from "next/link";
import { CircleAlert } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DashboardStockLine } from "@/lib/api/admin/dashboard";
import { cn } from "@/lib/utils";

export function LowStockCard({ lowStock }: { lowStock: DashboardStockLine[] }) {
  const rows = [...lowStock].sort(
    (a, b) =>
      a.stock / Math.max(a.threshold, 1) -
      b.stock / Math.max(b.threshold, 1),
  );

  return (
    <Card className="min-w-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>Running low</CardTitle>
        <CardDescription>Variants at or under their threshold</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/admin/variations" />}
          >
            Manage
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tracked variants are under their threshold.
          </p>
        ) : null}

        {rows.map((row) => {
          const share = Math.min(row.stock / Math.max(row.threshold, 1), 1);
          const out = row.stock === 0;

          return (
            <div key={row.id} className="grid min-w-0 gap-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.product}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.variant} · {row.sku}
                  </p>
                </div>

                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums",
                    out ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {out && <CircleAlert className="size-3.5" aria-hidden />}
                  {out ? "Out of stock" : `${row.stock} of ${row.threshold}`}
                </span>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    out
                      ? "bg-destructive"
                      : share <= 0.34
                        ? "bg-warning"
                        : "bg-chart-1",
                  )}
                  // A zero-width bar looks like a missing bar, so an empty
                  // variant still shows a sliver - in the danger colour.
                  style={{ width: `${Math.max(share * 100, 4)}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
