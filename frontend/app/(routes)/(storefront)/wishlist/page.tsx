import type { Metadata } from "next";
import { Suspense } from "react";

import { WishlistView } from "@/components/wishlist/wishlist-view";

export const metadata: Metadata = {
  title: "Wishlist",
  description: "Products you have saved for later.",
  // Personal and signed-in - nothing to index.
  robots: { index: false, follow: false },
};

/**
 * Saved products.
 *
 * A thin server shell, like `/orders` and `/account`: every endpoint behind it
 * derives the owner from the access token, so there is nothing the server
 * render could fetch on the shopper's behalf.
 */
export default function WishlistPage() {
  return (
    <Suspense>
      <WishlistView />
    </Suspense>
  );
}
