"use client";

/**
 * The heart on a product card.
 *
 * Sits inside the card's link, so it stops the click from navigating before
 * doing anything else. Guests are sent to sign-in rather than shown a failing
 * request — the wishlist is server-side and there is nowhere to put a guest's.
 */

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";
import { useWishlist } from "@/hooks/use-wishlist";

export function WishlistButton({
  productId,
  productName,
  className,
  /**
   * `icon` is the circular heart that floats on a product card. `inline` is a
   * labelled text action for the product page, where a bare heart sitting
   * beside two labelled buttons reads as a third, unexplained one.
   */
  variant = "icon",
}: {
  productId: string;
  productName: string;
  className?: string;
  variant?: "icon" | "inline";
}) {
  const router = useRouter();
  const { isSaved, toggle, canSave } = useWishlist();
  const saved = isSaved(productId);

  function onToggle(event: React.MouseEvent) {
    // The whole card is an anchor; without this the tap navigates away.
    event.preventDefault();
    event.stopPropagation();

    if (!canSave) {
      router.push("/login?next=/wishlist");
      return;
    }
    toggle(productId);
  }

  if (variant === "inline") {
    return (
      <button
        type="button"
        aria-pressed={saved}
        onClick={onToggle}
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-field px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-sale focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          saved && "text-sale",
          className,
        )}
      >
        <Heart className={cn("size-4", saved && "fill-current")} aria-hidden />
        {saved ? "Saved to wishlist" : "Save for later"}
      </button>
    );
  }

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.85 }}
      aria-pressed={saved}
      aria-label={
        saved ? `Remove ${productName} from wishlist` : `Save ${productName}`
      }
      onClick={onToggle}
      className={cn(
        "flex size-8 items-center justify-center rounded-full border bg-background/85 text-muted-foreground shadow-card backdrop-blur transition-colors hover:text-sale focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        saved && "border-sale/30 text-sale",
        className,
      )}
    >
      <Heart className={cn("size-4", saved && "fill-current")} aria-hidden />
    </motion.button>
  );
}
