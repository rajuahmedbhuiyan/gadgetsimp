"use client";

/**
 * Order summary and the checkout gate.
 *
 * Two figures that look similar and are not: `subtotal` counts **purchasable
 * lines only**, while `totalQuantity` counts every line including the ones
 * that cannot be bought. Showing a total that includes a withdrawn product
 * would mean the number silently drops at checkout - the worst moment to
 * discover it - so the unavailable count is called out separately instead.
 *
 * Checkout gates on `summary.checkoutReady` alone. That flag already folds in
 * every issue on every line, so re-deriving it here would only create a second
 * opinion that can disagree with the server's.
 */

import Link from "next/link";
import { ArrowRight, ShieldCheck, TriangleAlert, Truck } from "lucide-react";

import { formatPrice } from "@/lib/format";
import { contact } from "@/lib/config/site";
import type { CartSummary as Summary } from "@/lib/api/cart";
import { Button } from "@/components/ui/button";

export function CartSummary({ summary }: { summary: Summary }) {
  const { currency, subtotal, discount, checkoutReady, unavailableCount } =
    summary;

  const freeDelivery = subtotal >= contact.freeDeliveryFrom;
  const toFreeDelivery = Math.max(0, contact.freeDeliveryFrom - subtotal);

  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold">Order summary</h2>

      <dl className="flex flex-col gap-2.5 text-sm">
        <Row
          label={`Subtotal (${summary.totalQuantity} ${
            summary.totalQuantity === 1 ? "item" : "items"
          })`}
          value={formatPrice(subtotal, currency)}
        />

        {discount > 0 ? (
          <Row
            label="Discount"
            value={`− ${formatPrice(discount, currency)}`}
            tone="success"
          />
        ) : null}

        <Row
          label="Delivery"
          value={freeDelivery ? "Free" : "Calculated at checkout"}
          tone={freeDelivery ? "success" : "muted"}
        />
      </dl>

      <div className="mt-4 flex items-baseline justify-between border-t pt-4">
        <span className="text-sm font-semibold">Total</span>
        <span className="font-heading text-2xl font-bold text-price">
          {formatPrice(subtotal, currency)}
        </span>
      </div>

      {/* Progress toward the free-delivery threshold, which is a real reason
          to add one more thing rather than a decoration. */}
      {!freeDelivery && subtotal > 0 ? (
        <div className="mt-4 rounded-lg bg-muted/50 p-3">
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Truck className="mt-px size-3.5 shrink-0 text-brand" aria-hidden />
            <span>
              Add{" "}
              <strong className="font-semibold text-foreground">
                {formatPrice(toFreeDelivery, currency)}
              </strong>{" "}
              more for free delivery.
            </span>
          </p>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
            role="presentation"
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500"
              style={{
                width: `${Math.min(100, (subtotal / contact.freeDeliveryFrom) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {unavailableCount > 0 ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-xs text-foreground"
        >
          <TriangleAlert
            className="mt-px size-4 shrink-0 text-destructive"
            aria-hidden
          />
          <span>
            {unavailableCount === 1
              ? "One item cannot be ordered."
              : `${unavailableCount} items cannot be ordered.`}{" "}
            Remove {unavailableCount === 1 ? "it" : "them"} to continue.
          </span>
        </p>
      ) : null}

      <Button
        className="mt-5 h-12 w-full cursor-pointer gap-2 rounded-field text-sm font-semibold"
        disabled={!checkoutReady}
        render={checkoutReady ? <Link href="/checkout" /> : undefined}
      >
        {checkoutReady ? "Proceed to checkout" : "Cannot check out yet"}
        {checkoutReady ? <ArrowRight className="size-4" aria-hidden /> : null}
      </Button>

      <Button
        variant="outline"
        className="mt-3 h-11 w-full cursor-pointer rounded-field text-sm font-medium"
        render={<Link href="/shop" />}
      >
        Continue shopping
      </Button>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        Cash on delivery · 7 day returns
      </p>
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
  tone?: "default" | "muted" | "success";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          tone === "success"
            ? "font-medium text-success"
            : tone === "muted"
              ? "text-muted-foreground"
              : "font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}
