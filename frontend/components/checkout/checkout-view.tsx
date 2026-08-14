"use client";

/**
 * The checkout page body, and the guards in front of it.
 *
 * Four states before the form is worth rendering: the session is still
 * resolving, the shopper is signed out, the cart is empty, or the cart holds
 * something that cannot be ordered. The last one matters most - the API
 * refuses the *whole* order if any line is unavailable, so letting someone
 * fill in an address first only wastes their time.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShoppingBag, TriangleAlert } from "lucide-react";

import { useCart } from "@/hooks/use-cart";
import { DEFAULT_DISTRICT, deliveryFeeFor } from "@/lib/checkout/bangladesh";
import { Button } from "@/components/ui/button";
import { CartSignedOut } from "@/components/cart/cart-states";
import { CheckoutSkeleton } from "./checkout-skeleton";
import { CheckoutForm } from "./checkout-form";
import { OrderReview } from "./order-review";

export function CheckoutView() {
  const { cart, isLoading, isAuthenticated } = useCart();

  /*
   * The district lives here rather than only inside the form, because the
   * summary beside it has to quote a delivery fee from the same value. The
   * form still owns the field; it just reports the choice upward.
   */
  const [district, setDistrict] = useState(DEFAULT_DISTRICT);
  const deliveryFee = deliveryFeeFor(district);

  if (isLoading) return <CheckoutSkeleton />;
  if (!isAuthenticated) return <CartSignedOut />;

  if (cart.items.length === 0) {
    return (
      <Guard
        icon={ShoppingBag}
        title="There is nothing to check out"
        description="Your cart is empty, so there is no order to place yet."
        action={{ href: "/shop", label: "Browse the shop" }}
      />
    );
  }

  // `checkoutReady` already folds in every issue on every line, so this is the
  // same gate the cart page uses rather than a second opinion.
  if (!cart.summary.checkoutReady) {
    return (
      <Guard
        icon={TriangleAlert}
        title="Some items need your attention"
        description="One or more items in your cart cannot be ordered right now. Remove them and come back."
        action={{ href: "/cart", label: "Back to cart" }}
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
      <div className="flex flex-col gap-4">
        <CheckoutForm onDistrictChange={setDistrict} />

        <Link
          href="/cart"
          className="group inline-flex items-center gap-1.5 self-start rounded-field px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-brand-foreground dark:hover:text-brand"
        >
          <ArrowLeft
            className="size-4 transition-transform duration-200 group-hover:-translate-x-1"
            aria-hidden
          />
          Back to cart
        </Link>
      </div>

      <aside className="lg:sticky lg:top-40 lg:self-start">
        <OrderReview cart={cart} deliveryFee={deliveryFee} />
      </aside>
    </div>
  );
}

function Guard({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof ShoppingBag;
  title: string;
  description: string;
  action: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-20 text-center">
      <span className="mb-5 flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-8" aria-hidden />
      </span>
      <h2 className="font-heading text-xl font-bold tracking-tight lg:text-2xl">
        {title}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <Button
        className="mt-7 h-12 cursor-pointer rounded-field px-6 text-sm font-semibold"
        render={<Link href={action.href} />}
      >
        {action.label}
      </Button>
    </div>
  );
}
