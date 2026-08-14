"use client";

/**
 * Where the order is, as a line rather than a label.
 *
 * The whole point of the detail page: someone opening it wants "where is my
 * parcel", and a status word alone does not answer that - it does not say what
 * has already happened or what comes next. Four steps on a rail does.
 *
 * Horizontal from `sm`, vertical below it. A four-step horizontal tracker on a
 * 375px screen leaves about 80px per label, which is not enough for "Out for
 * delivery" without truncating the one step people most want to read.
 *
 * A cancelled or returned order does not render a rail at all: it did not
 * progress, it stopped, and showing three green ticks above "Canceled" tells
 * the wrong story.
 */

import { motion } from "motion/react";
import { TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { EASE_BRAND } from "@/lib/motion";
import type { Order } from "@/lib/api/orders";
import {
  formatOrderDate,
  isTerminated,
  statusMeta,
  trackProgress,
  trackSteps,
} from "@/lib/orders/status";

export function OrderTracker({ order }: { order: Order }) {
  if (isTerminated(order.status)) return <Terminated order={order} />;

  const steps = trackSteps(order);
  const progress = trackProgress(order);

  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="mb-6 text-sm font-semibold">Order tracking</h2>

      {/* ---------------------------------------------------- horizontal -- */}
      <div className="hidden sm:block">
        <div className="relative">
          {/* The rail sits behind the markers, inset by half a marker at each
              end so it starts and stops at their centres. */}
          <div className="absolute top-5 right-5 left-5 h-0.5 rounded-full bg-border" />
          <motion.div
            className="absolute top-5 left-5 h-0.5 rounded-full bg-brand"
            initial={{ width: 0 }}
            animate={{ width: `calc((100% - 2.5rem) * ${progress})` }}
            transition={{ duration: 0.7, ease: EASE_BRAND }}
          />

          <ol className="relative flex justify-between">
            {steps.map((step) => (
              <li
                key={step.status}
                className="flex w-24 flex-col items-center text-center"
              >
                <Marker step={step} />
                <span
                  className={cn(
                    "mt-2 text-xs font-medium",
                    step.done ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
                {step.at ? (
                  <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    {formatOrderDate(step.at)}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>

        <p className="mt-6 rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          {statusMeta(order.status).description}
        </p>
      </div>

      {/* ------------------------------------------------------ vertical -- */}
      <ol className="flex flex-col sm:hidden">
        {steps.map((step, index) => (
          <li key={step.status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <Marker step={step} />
              {index < steps.length - 1 ? (
                <span
                  className={cn(
                    "w-0.5 flex-1 rounded-full",
                    steps[index + 1]?.done ? "bg-brand" : "bg-border",
                  )}
                />
              ) : null}
            </div>

            <div className={cn("pb-6", index === steps.length - 1 && "pb-0")}>
              <p
                className={cn(
                  "text-sm font-medium",
                  step.done ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </p>
              {step.at ? (
                <p className="text-xs text-muted-foreground">
                  {formatOrderDate(step.at)}
                </p>
              ) : null}
              {step.current ? (
                <p className="mt-1 text-xs text-brand-foreground dark:text-brand">
                  {step.description}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Marker({
  step,
}: {
  step: ReturnType<typeof trackSteps>[number];
}) {
  const Icon = step.icon;

  return (
    <span
      className={cn(
        "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 bg-card transition-colors",
        step.done
          ? "border-brand bg-brand text-brand-foreground"
          : "border-border text-muted-foreground",
      )}
    >
      {/* A quiet pulse on the step the order is actually sitting at, so the
          eye lands on "now" rather than on the last tick. */}
      {step.current ? (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-brand/40"
          animate={{ scale: [1, 1.45], opacity: [0.6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      ) : null}
      <Icon className="relative size-4.5" aria-hidden />
    </span>
  );
}

/** Cancelled or returned: one clear statement, no rail. */
function Terminated({ order }: { order: Order }) {
  const meta = statusMeta(order.status);
  const Icon = meta.icon;

  // The API makes a note mandatory on these two, so there is always a reason.
  const reason = order.statusHistory?.findLast?.(
    (event) => event.status === order.status,
  )?.note;

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{meta.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta.description}
          </p>
          {reason ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-background/60 px-3 py-2 text-xs text-muted-foreground">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {reason}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
