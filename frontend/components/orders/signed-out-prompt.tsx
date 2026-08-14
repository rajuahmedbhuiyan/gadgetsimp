/**
 * The sign-in wall for the order pages.
 *
 * Orders are the one part of the shop that genuinely needs an account: a guest
 * order exists on the server but is attached to nobody, so there is no local
 * fallback the way there is for the cart.
 *
 * `next` brings them straight back here, which matters most on a deep link -
 * someone opening `/orders/1002` from an email should land on that order, not
 * on the home page.
 */

import Link from "next/link";
import { LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SignedOutPrompt({
  title,
  description,
  next,
}: {
  title: string;
  description: string;
  next: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-20 text-center">
      <span className="mb-5 flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <LockKeyhole className="size-8" aria-hidden />
      </span>

      <h2 className="font-heading text-xl font-bold tracking-tight lg:text-2xl">
        {title}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button
          className="h-12 cursor-pointer rounded-field px-6 text-sm font-semibold"
          render={<Link href={`/login?next=${encodeURIComponent(next)}`} />}
        >
          Sign in
        </Button>
        <Button
          variant="outline"
          className="h-12 cursor-pointer rounded-field px-6 text-sm font-semibold"
          render={<Link href={`/register?next=${encodeURIComponent(next)}`} />}
        >
          Create an account
        </Button>
      </div>
    </div>
  );
}
