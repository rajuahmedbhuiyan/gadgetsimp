"use client";

/**
 * One cart row.
 *
 * The rule that shapes this component: **an unavailable line is never
 * hidden**. It comes back from the API flagged precisely so the shopper can
 * see it and remove it - drop it from the list and they are left with a cart
 * that will not check out and no way to find out why. So the row renders
 * dimmed, says what is wrong, and keeps its remove button working.
 *
 * The stepper decrements to zero rather than switching to a delete call: the
 * API treats `quantity: 0` as a removal, which is what stops the classic "the
 * last one will not delete" bug.
 */

import Image from "next/image";
import Link from "next/link";
import { ImageOff, Loader2, Minus, Plus, Trash2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { lineCeiling, type CartLine } from "@/lib/api/cart";
import { Badge } from "@/components/ui/badge";

export function CartLineRow({
  line,
  busy,
  onQuantityChange,
  onRemove,
}: {
  line: CartLine;
  busy?: boolean;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}) {
  const { product, variant, availability, issues } = line;
  const unavailable = !availability.purchasable;
  const ceiling = lineCeiling(line);

  // A deleted product has no slug to link to; everything else does.
  const href = product.slug ? `/shop/${product.slug}` : null;
  const image = variant?.image ?? product.thumbnail;
  const name = product.name ?? "This product is no longer available";

  return (
    <li
      className={cn(
        "flex gap-3 py-5 first:pt-0 last:pb-0 sm:gap-4",
        busy && "pointer-events-none opacity-60",
      )}
    >
      <div
        className={cn(
          "relative size-20 shrink-0 overflow-hidden rounded-xl border bg-muted/30 sm:size-24",
          unavailable && "opacity-50 saturate-50",
        )}
      >
        {image?.src ? (
          <Image
            src={image.src}
            alt=""
            fill
            sizes="96px"
            className="object-contain p-2"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-5" aria-hidden />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {href ? (
              <Link
                href={href}
                className="line-clamp-2 text-sm leading-snug font-medium transition-colors hover:text-brand"
              >
                {name}
              </Link>
            ) : (
              <p className="line-clamp-2 text-sm leading-snug font-medium text-muted-foreground">
                {name}
              </p>
            )}

            {variant?.label ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {variant.label}
              </p>
            ) : null}
          </div>

          {/* Right-aligned so the money column lines up down the list. */}
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold text-price">
              {formatPrice(line.lineTotal, line.currency)}
            </p>
            {line.discountPercent > 0 ? (
              <p className="text-xs text-muted-foreground line-through">
                {formatPrice(line.originalLineTotal, line.currency)}
              </p>
            ) : null}
          </div>
        </div>

        {issues.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {issues.map((issue) => (
              <li
                key={issue.code}
                className={cn(
                  "flex items-start gap-1.5 text-xs",
                  // A price move is information; the rest block checkout.
                  issue.code === "PRICE_CHANGED"
                    ? "text-muted-foreground"
                    : "text-destructive",
                )}
              >
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                {issue.message}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
          {unavailable ? (
            <Badge variant="destructive">Unavailable</Badge>
          ) : (
            <Stepper
              value={line.quantity}
              max={ceiling}
              busy={busy}
              unitPrice={line.unitPrice}
              currency={line.currency}
              onChange={onQuantityChange}
            />
          )}

          <button
            type="button"
            onClick={onRemove}
            className="flex cursor-pointer items-center gap-1.5 rounded-field px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-3.5" aria-hidden />
            )}
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

function Stepper({
  value,
  max,
  busy,
  unitPrice,
  currency,
  onChange,
}: {
  value: number;
  max: number;
  busy?: boolean;
  unitPrice: number | null;
  currency: string;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 items-center rounded-field border">
        <StepButton
          label="Decrease quantity"
          // Zero is a removal at the API, but the row has its own Remove
          // button - stopping at one keeps the two actions distinct.
          disabled={busy || value <= 1}
          onClick={() => onChange(value - 1)}
        >
          <Minus className="size-3.5" aria-hidden />
        </StepButton>

        <span
          aria-live="polite"
          className="w-9 text-center text-sm font-semibold tabular-nums"
        >
          {value}
        </span>

        <StepButton
          label="Increase quantity"
          disabled={busy || value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="size-3.5" aria-hidden />
        </StepButton>
      </div>

      {unitPrice != null ? (
        <span className="text-xs text-muted-foreground">
          {formatPrice(unitPrice, currency)} each
        </span>
      ) : null}
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 cursor-pointer items-center justify-center rounded-field text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
