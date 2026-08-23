/**
 * The four numbers the dashboard leads with.
 *
 * Stat tiles, not a bar chart: four unrelated headline figures have nothing to
 * compare against each other, and drawing them as bars would invite exactly
 * that reading.
 *
 * The delta's colour comes from whether the move is *good*, not whether it is
 * up - a falling return rate is the best news on the row - and the arrow plus
 * the sign carry the same information, so the colour is never the only signal.
 */

import { TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatPrice } from "@/lib/format";
import type { DashboardKpi } from "@/lib/api/admin/dashboard";
import { cn } from "@/lib/utils";

export function KpiRow({
  currency,
  kpis,
}: {
  currency: string;
  kpis: DashboardKpi[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => {
        const rising = kpi.delta >= 0;
        const good = rising === kpi.riseIsGood;
        const Arrow = rising ? TrendingUp : TrendingDown;

        return (
          <Card key={kpi.key} className="min-w-0">
            <CardContent className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">{kpi.label}</p>

              {/* Proportional figures on purpose: `tabular-nums` gives every
                  digit the width of a zero, which reads loose at this size. */}
              <p className="font-heading text-2xl font-semibold tracking-tight">
                {formatKpiValue(kpi, currency)}
              </p>

              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-medium",
                    good ? "text-success" : "text-destructive",
                  )}
                >
                  <Arrow className="size-3.5" aria-hidden />
                  {rising ? "+" : "−"}
                  {Math.abs(kpi.delta)}%
                </span>
                <span className="text-muted-foreground">on last month</span>
              </p>

              <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function formatKpiValue(kpi: DashboardKpi, currency: string) {
  if (kpi.format === "money") return formatPrice(kpi.value, currency);
  if (kpi.format === "percent") return `${kpi.value}%`;
  return kpi.value.toLocaleString("en-US");
}
