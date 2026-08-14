/**
 * The one line that says whether this can be bought right now.
 *
 * Three states worth distinguishing, because they call for different things
 * from the shopper: buy whenever, buy soon, do not bother. "Only 2 left" is
 * only shown when the shop is actually counting (`trackInventory`) and the
 * count has fallen to the threshold the merchandiser set - a hardcoded "low
 * stock" number would be wrong for a shop selling cables by the hundred.
 */

import { CircleAlert, CircleCheck, CircleSlash } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StockInfo } from "@/lib/api/shop";

export function StockLine({
  stock,
  /** A VARIABLE product before any option is picked has no stock to report. */
  awaitingChoice = false,
  className,
}: {
  stock: StockInfo;
  awaitingChoice?: boolean;
  className?: string;
}) {
  if (awaitingChoice) {
    return (
      <p className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <CircleAlert className="size-4 shrink-0" aria-hidden />
        Choose an option to see availability
      </p>
    );
  }

  if (stock.status !== "IN_STOCK") {
    return (
      <p className={cn("flex items-center gap-2 text-sm font-medium text-destructive", className)}>
        <CircleSlash className="size-4 shrink-0" aria-hidden />
        Out of stock
      </p>
    );
  }

  const low =
    stock.trackInventory &&
    stock.quantity > 0 &&
    stock.quantity <= stock.lowStockThreshold;

  return (
    <p
      className={cn(
        "flex items-center gap-2 text-sm font-medium",
        low ? "text-warning" : "text-success",
        className,
      )}
    >
      {low ? (
        <CircleAlert className="size-4 shrink-0" aria-hidden />
      ) : (
        <CircleCheck className="size-4 shrink-0" aria-hidden />
      )}
      {low
        ? `Only ${stock.quantity} left — order soon`
        : "In stock, ready to ship"}
    </p>
  );
}
