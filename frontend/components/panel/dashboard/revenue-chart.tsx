"use client";

/**
 * Revenue, twelve months.
 *
 * Hand-drawn SVG rather than a charting library: one series, one axis pair, and
 * nothing in `package.json` that draws charts. The rules it follows are the
 * ones that make a chart readable rather than decorative -
 *
 *  - **One series, so no legend.** The card's title says what is plotted; a box
 *    with a single swatch would only repeat it.
 *  - **One axis.** A second measure would get its own card, never a second
 *    y-scale on this one.
 *  - **Thin marks, recessive chrome.** A 2px line over a 10% wash, hairline
 *    solid gridlines a step off the surface. The data is the loud part.
 *  - **Labelled selectively.** The endpoint carries a value; everything else is
 *    read off the axis, the hover, or the table below - never a number on all
 *    twelve points.
 *  - **The hover is not the only way in.** Pointer, keyboard and the table view
 *    all reach the same figures, so nothing is gated behind a mouse.
 *
 * The series colour is `--chart-1`, which is the brand amber deepened until it
 * clears 3:1 on both card surfaces (see `globals.css`) - the button amber is
 * invisible as a 2px line on white.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DashboardRevenuePoint } from "@/lib/api/admin/dashboard";
import { formatPrice } from "@/lib/format";

/** Plot box, in px. The x-axis band is extra, so its labels are never clipped. */
const PLOT_HEIGHT = 208;
const AXIS_BAND = 22;
/** Room for `৳800k` down the left. */
const GUTTER = 46;
const PAD_TOP = 18;
const PAD_RIGHT = 14;

export function RevenueChart({
  currency,
  revenueTrend,
}: {
  currency: string;
  revenueTrend: DashboardRevenuePoint[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  // Measured rather than scaled by `viewBox`: a stretched viewBox would thin
  // the stroke and shrink the labels on a phone, which is where they are
  // already hardest to read.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry?.contentRect.width ?? 0));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const max = useMemo(
    () => niceCeiling(Math.max(0, ...revenueTrend.map((point) => point.revenue))),
    [revenueTrend],
  );

  const geometry = useMemo(() => {
    if (width <= 0) return null;

    const innerWidth = Math.max(width - GUTTER - PAD_RIGHT, 1);
    const step = innerWidth / Math.max(revenueTrend.length - 1, 1);
    const baseline = PLOT_HEIGHT;

    const points = revenueTrend.map((point, index) => ({
      ...point,
      x: GUTTER + index * step,
      y:
        PAD_TOP +
        (1 - point.revenue / max) * (PLOT_HEIGHT - PAD_TOP),
    }));

    const line = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
      .join(" ");

    const first = points[0]!;
    const last = points.at(-1)!;
    const area = `${line} L${last.x},${baseline} L${first.x},${baseline} Z`;

    return { points, line, area, step, baseline, innerWidth };
  }, [width, max, revenueTrend]);

  // Five levels including zero and the top: enough to read a value off,
  // few enough to stay out of the way.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * max);

  // Every month fits on a laptop; on a phone every third one does, and the
  // rest are covered by the hover and the table.
  const labelEvery = width >= 620 ? 1 : width >= 420 ? 2 : 3;

  const activePoint =
    active !== null && geometry ? (geometry.points[active] ?? null) : null;

  function pick(clientX: number) {
    const element = containerRef.current;
    if (!element || !geometry) return;

    const bounds = element.getBoundingClientRect();
    const index = Math.round((clientX - bounds.left - GUTTER) / geometry.step);
    setActive(clamp(index, 0, Math.max(revenueTrend.length - 1, 0)));
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = (active ?? -1) + (event.key === "ArrowRight" ? 1 : -1);
      setActive(clamp(next, 0, Math.max(revenueTrend.length - 1, 0)));
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  const latest = revenueTrend.at(-1) ?? { month: "Now", revenue: 0 };

  return (
    <Card className="min-w-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>Revenue</CardTitle>
        <CardDescription>
          Last 12 months, delivered orders only
        </CardDescription>
      </CardHeader>

      <CardContent className="min-w-0">
        <div
          ref={containerRef}
          className="relative w-full touch-pan-y"
          style={{ height: PLOT_HEIGHT + AXIS_BAND }}
          onPointerMove={(event) => pick(event.clientX)}
          onPointerLeave={() => setActive(null)}
        >
          {geometry && (
            <svg
              width={width}
              height={PLOT_HEIGHT + AXIS_BAND}
              role="img"
              tabIndex={0}
              aria-label={`Monthly revenue for the last twelve months, ending at ${formatPrice(latest.revenue, currency)} in ${latest.month}. Use the arrow keys to step through each month, or read every value in the table below.`}
              onKeyDown={onKeyDown}
              onBlur={() => setActive(null)}
              className="overflow-visible rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {/* Grid and y labels ------------------------------------- */}
              {ticks.map((tick) => {
                const y =
                  PAD_TOP + (1 - tick / max) * (PLOT_HEIGHT - PAD_TOP);
                return (
                  <g key={tick}>
                    <line
                      x1={GUTTER}
                      x2={width - PAD_RIGHT}
                      y1={y}
                      y2={y}
                      className="stroke-border"
                      strokeWidth={1}
                    />
                    <text
                      x={GUTTER - 8}
                      y={y}
                      textAnchor="end"
                      dominantBaseline="middle"
                      className="fill-muted-foreground text-[10px] tabular-nums"
                    >
                      {compactTaka(tick)}
                    </text>
                  </g>
                );
              })}

              {/* The series ------------------------------------------- */}
              <path d={geometry.area} className="fill-chart-1/10" />
              <path
                d={geometry.line}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-chart-1"
              />

              {/* The endpoint is the one point worth labelling outright. */}
              <circle
                cx={geometry.points.at(-1)!.x}
                cy={geometry.points.at(-1)!.y}
                r={4}
                className="fill-chart-1 stroke-card"
                strokeWidth={2}
              />
              <text
                x={width - PAD_RIGHT}
                y={Math.max(geometry.points.at(-1)!.y - 12, 10)}
                textAnchor="end"
                className="fill-foreground text-[11px] font-medium"
              >
                {formatPrice(latest.revenue, currency)}
              </text>

              {/* Hover / focus --------------------------------------- */}
              {activePoint && (
                <g>
                  <line
                    x1={activePoint.x}
                    x2={activePoint.x}
                    y1={PAD_TOP - 6}
                    y2={geometry.baseline}
                    className="stroke-border"
                    strokeWidth={1}
                  />
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.y}
                    r={4.5}
                    className="fill-chart-1 stroke-card"
                    strokeWidth={2}
                  />
                </g>
              )}

              {/* x labels -------------------------------------------- */}
              {geometry.points.map((point, index) =>
                index % labelEvery === 0 ? (
                  <text
                    key={point.month}
                    x={point.x}
                    y={PLOT_HEIGHT + 15}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px]"
                  >
                    {point.month}
                  </text>
                ) : null,
              )}
            </svg>
          )}

          {activePoint && (
            <div
              // Clamped to the container so a reading at either end is not half
              // off the card.
              style={{
                left: clamp(activePoint.x, 64, Math.max(width - 64, 64)),
                top: Math.max(activePoint.y - 46, 0),
              }}
              className="pointer-events-none absolute -translate-x-1/2 rounded-lg bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10"
            >
              <p className="text-[11px] text-muted-foreground">
                {activePoint.month}
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {formatPrice(activePoint.revenue, currency)}
              </p>
            </div>
          )}
        </div>

        {/* The chart's twin. Every value the plot draws, reachable without a
            pointer, a hover, or working colour vision. */}
        <details className="mt-4 border-t pt-3 text-sm">
          <summary className="w-fit list-none text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">
            Show the values
          </summary>
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">
              Revenue by month for the last twelve months
            </caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1 font-medium">
                  Month
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {revenueTrend.map((point) => (
                <tr key={point.month} className="border-t">
                  <th scope="row" className="py-1.5 font-normal">
                    {point.month}
                  </th>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatPrice(point.revenue, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </CardContent>
    </Card>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** `793,000` -> `800,000`, so the top gridline is a number, not a maximum. */
function niceCeiling(max: number) {
  if (max <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    const step = magnitude * factor;
    if (max <= step * 4) return step * 4;
  }
  return max;
}

/** `800000` -> `৳800k`. Axis ticks, where the full figure would not fit. */
function compactTaka(value: number) {
  if (value === 0) return "৳0";
  if (value >= 1_000_000) return `৳${(value / 1_000_000).toFixed(1)}m`;
  return `৳${Math.round(value / 1_000)}k`;
}
