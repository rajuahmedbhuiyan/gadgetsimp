"use client";

/**
 * The order as it will be placed, beside the form.
 *
 * Read-only on purpose. Editing quantities belongs on the cart page; a stepper
 * here would mean the figures could move under someone who is halfway through
 * typing an address. The one way out is a link back.
 *
 * Every number comes from the cart the server priced - nothing here adds up a
 * total of its own, which is the same rule the request body follows.
 */

import Image from "next/image";
import Link from "next/link";
import { ImageOff, PencilLine } from "lucide-react";

import { formatPrice } from "@/lib/format";
import type { Cart } from "@/lib/api/cart";

/*
 * A note on the two subtotals.
 *
 * `summary.subtotal` is already **net of the discount** - it is what the
 * shopper pays. `summary.originalSubtotal` is the pre-discount figure and
 * `discount` is the difference between them.
 *
 * Printing `subtotal`, then a discount line, then `subtotal` again as the
 * total was arithmetic that did not add up on screen: 2,490 − 800 = 2,490.
 * The "Subtotal" row has to be the *original*, so the discount below it has
 * something to subtract from.
 */
export function OrderReview({
  cart,
  /** Quoted from the chosen district; `null` until one is picked. */
  deliveryFee,
}: {
  cart: Cart;
  deliveryFee: number | null;
}) {
  const { summary } = cart;

  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold">
          Your order ({summary.totalQuantity}{" "}
          {summary.totalQuantity === 1 ? "item" : "items"})
        </h2>
        <Link
          href="/cart"
          className="flex items-center gap-1.5 rounded-field px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-brand-foreground dark:hover:text-brand"
        >
          <PencilLine className="size-3.5" aria-hidden />
          Edit
        </Link>
      </div>

      <ul className="divide-y">
        {cart.items.map((line) => (
          <li key={line.id} className="flex items-center gap-3 py-3">
            {/* No `overflow-hidden` here: the quantity badge below sits outside
                  these bounds and would be clipped by it. The image rounds
                  itself instead. */}
              <span className="relative size-12 shrink-0 rounded-lg border bg-muted/30">
              {(line.variant?.image ?? line.product.thumbnail)?.src ? (
                <Image
                  src={(line.variant?.image ?? line.product.thumbnail)!.src}
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
              {/* The count sits on the thumbnail rather than in its own column,
                  which keeps the row to two columns on a narrow sidebar. */}
              <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground tabular-nums">
                {line.quantity}
              </span>
            </span>

            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 text-sm font-medium">
                {line.product.name ?? "Unavailable product"}
              </span>
              {line.variant?.label ? (
                <span className="block text-xs text-muted-foreground">
                  {line.variant.label}
                </span>
              ) : null}
            </span>

            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {formatPrice(line.lineTotal, line.currency)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 flex flex-col gap-2.5 border-t pt-4 text-sm">
        <Row
          label="Subtotal"
          value={formatPrice(summary.originalSubtotal, summary.currency)}
        />
        {summary.discount > 0 ? (
          <Row
            label="Discount"
            value={`− ${formatPrice(summary.discount, summary.currency)}`}
            tone="success"
          />
        ) : null}
        <Row
          label="Delivery"
          value={
            deliveryFee == null
              ? "Choose a district"
              : formatPrice(deliveryFee, summary.currency)
          }
          tone={deliveryFee == null ? "muted" : "default"}
        />
      </dl>

      <div className="mt-4 flex items-baseline justify-between border-t pt-4">
        <span className="text-sm font-semibold">Pay on delivery</span>
        <span className="font-heading text-2xl font-bold text-price">
          {formatPrice(summary.subtotal + (deliveryFee ?? 0), summary.currency)}
        </span>
      </div>
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
