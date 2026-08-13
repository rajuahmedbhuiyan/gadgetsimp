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
}: {
  productId: string;
  productName: string;
  className?: string;
}) {
  const router = useRouter();
  const { isSaved, toggle, canSave } = useWishlist();
  const saved = isSaved(productId);

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.85 }}
      aria-pressed={saved}
      aria-label={
        saved ? `Remove ${productName} from wishlist` : `Save ${productName}`
      }
      onClick={(event) => {
        // The whole card is an anchor; without this the tap navigates away.
        event.preventDefault();
        event.stopPropagation();

        if (!canSave) {
          router.push("/login?next=/wishlist");
          return;
        }
        toggle(productId);
      }}
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
