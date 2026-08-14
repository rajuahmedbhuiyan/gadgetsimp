/**
 * The two screens that are not a list of items.
 *
 * There is no signed-out screen any more: a guest keeps their cart in
 * `localStorage` and checks out through the public order endpoint, so being
 * signed out is not a state the cart has to explain.
 *
 * Kept apart from `CartView` because each is a full-page state with its own
 * call to action, and nesting three of them inside the list component makes
 * the one that matters harder to read.
 */

import Link from "next/link";
import { ShoppingBag, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function Shell({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof ShoppingCart;
  title: string;
  description: string;
  children: React.ReactNode;
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
      <div className="mt-7 flex flex-wrap justify-center gap-3">{children}</div>
    </div>
  );
}

export function CartEmpty() {
  return (
    <Shell
      icon={ShoppingBag}
      title="Your cart is empty"
      description="Once you add something it will show up here, ready to check out with cash on delivery."
    >
      <Button
        className="h-12 cursor-pointer gap-2 rounded-field px-6 text-sm font-semibold"
        render={<Link href="/shop" />}
      >
        Start shopping
      </Button>
    </Shell>
  );
}

/** Laid out on the real grid, so the swap is a fill rather than a reflow. */
export function CartSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.7fr_1fr]">
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <Skeleton className="mb-5 h-5 w-32" />
        <ul className="divide-y">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="flex gap-4 py-5 first:pt-0">
              <Skeleton className="size-20 shrink-0 rounded-xl sm:size-24" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-4 h-10 w-32 rounded-field" />
              </div>
              <Skeleton className="h-4 w-16 shrink-0" />
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <Skeleton className="mb-5 h-5 w-32" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="mt-6 h-8 w-40" />
          <Skeleton className="mt-4 h-12 w-full rounded-field" />
        </div>
      </div>
    </div>
  );
}
