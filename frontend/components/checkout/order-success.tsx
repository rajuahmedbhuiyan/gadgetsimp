"use client";

/**
 * The confirmation screen.
 *
 * Reads the order from session storage rather than the API: `GET /orders/{id}`
 * is signed-in only, and the POST response is the only time a guest ever sees
 * their own order. See `lib/checkout/confirmation.ts`.
 *
 * The animation is a one-shot celebration - a tick that draws itself, a ring
 * that expands out of it, and the panels arriving in sequence. It runs once on
 * mount and never loops, because a confirmation screen someone is reading
 * their address off should settle down. Everything is skipped under
 * `prefers-reduced-motion`, which `MotionConfig` handles globally.
 */

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  CheckCircle2,
  ImageOff,
  Info,
  MapPin,
  Package,
  Phone,
  Truck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { EASE_BRAND } from "@/lib/motion";
import { formatPrice, humanise } from "@/lib/format";
import { whatsappLink } from "@/lib/config/site";
import type { Confirmation } from "@/lib/checkout/confirmation";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./copy-button";

export function OrderSuccess({ confirmation }: { confirmation: Confirmation }) {
  const { order, accountInvite, alreadyPlaced } = confirmation;
  const reduceMotion = useReducedMotion();

  /*
   * One column on a phone, two from `lg`.
   *
   * Stacked, the receipt ran to four full-width cards and a desktop reader had
   * to scroll past the item list to reach the address - on a page whose whole
   * job is "here is what you bought and where it is going". The confirmation
   * and the order number stay full width because they are the headline; the
   * detail splits into a wider items column and a narrower one for the
   * address and the next steps.
   */
  return (
    <div className="mx-auto w-full max-w-5xl">
      {/*
       * One band, not three stacked blocks.
       *
       * The tick, the confirmation and the order number used to run to roughly
       * 320px before a single item was visible - a receipt whose headline
       * pushed the receipt itself off the fold. They say one thing between
       * them ("it worked, here is the reference"), so they read as one row:
       * tick and message on the left, the number on the right, wrapping to two
       * rows only when there is genuinely no width for it.
       */}
      <Panel
        delay={0.3}
        className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
      >
        <div className="flex items-center gap-4">
          <Celebration reduceMotion={reduceMotion} />

          <div className="min-w-0">
            <h1 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
              {alreadyPlaced ? "Order already placed" : "Order confirmed"}
            </h1>
            <p className="mt-1 text-sm leading-snug text-muted-foreground">
              {alreadyPlaced
                ? "We found your original order rather than creating a second one."
                : "We will call to confirm before dispatch."}
            </p>
          </div>
        </div>

        {/* The number they quote on the phone, so it keeps its emphasis even
            at a third of the height. */}
        {/* `w-fit` so the box hugs the number instead of stretching, and
            `self-center` to place it on the cross axis - which centres it
            horizontally while the band is stacked and vertically once it is a
            row, so one class covers both. */}
        <div className="flex w-fit shrink-0 self-center items-center gap-3 rounded-field border border-dashed border-brand/40 bg-brand/8 px-4 py-3">
          <div className="min-w-0">
            <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Order number
            </span>
            <span className="block font-heading text-2xl leading-tight font-black tracking-tight tabular-nums">
              #{order.orderNumber}
            </span>
          </div>
          <CopyButton value={order.orderNumber} />
        </div>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <Panel delay={0.5}>
          <h2 className="mb-4 text-sm font-semibold">
            {order.totalQuantity} {order.totalQuantity === 1 ? "item" : "items"}
          </h2>

          <ul className="divide-y">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                {/* No `overflow-hidden` here: the quantity badge below sits outside
                  these bounds and would be clipped by it. The image rounds
                  itself instead. */}
                <span className="relative size-12 shrink-0 rounded-lg border bg-muted/30">
                  {item.thumbnail ? (
                    <Image
                      src={item.thumbnail}
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
                  <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground tabular-nums">
                    {item.quantity}
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  {item.slug ? (
                    <Link
                      href={`/shop/${item.slug}`}
                      className="line-clamp-1 text-sm font-medium transition-colors hover:text-brand"
                    >
                      {item.name}
                    </Link>
                  ) : (
                    <span className="line-clamp-1 text-sm font-medium">
                      {item.name}
                    </span>
                  )}
                  {item.variantLabel ? (
                    <span className="block text-xs text-muted-foreground">
                      {humanise(item.variantLabel)}
                    </span>
                  ) : null}
                </span>

                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatPrice(item.lineTotal, order.currency)}
                </span>
              </li>
            ))}
          </ul>

          {/*
           * `order.subtotal` is already the amount being charged, and
           * `order.discount` is the saving against the struck-through prices -
           * "reported, not deducted", in the server's own words. Printing the
           * charged figure as "Subtotal" and then subtracting the discount
           * below it produced a sum that did not work: 2,490 − 800 = 2,490. The
           * pre-discount figure is `subtotal + discount`.
           */}
          <dl className="mt-4 flex flex-col gap-2.5 border-t pt-4 text-sm">
            <Row
              label="Subtotal"
              value={formatPrice(
                order.subtotal + order.discount,
                order.currency,
              )}
            />
            {order.discount > 0 ? (
              <Row
                label="Discount"
                value={`− ${formatPrice(order.discount, order.currency)}`}
                tone="success"
              />
            ) : null}
            <Row
              label="Delivery"
              value={
                order.shippingFee > 0
                  ? formatPrice(order.shippingFee, order.currency)
                  : "Free"
              }
              tone={order.shippingFee > 0 ? "default" : "success"}
            />
          </dl>

          <div className="mt-4 flex items-baseline justify-between border-t pt-4">
            <span className="text-sm font-semibold">Pay on delivery</span>
            <span className="font-heading text-2xl font-bold text-price">
              {formatPrice(order.total, order.currency)}
            </span>
          </div>
        </Panel>

        <div className="flex flex-col gap-6">
          {accountInvite ? (
            <Panel delay={0.45}>
              <AccountInviteNote status={accountInvite.status} />
            </Panel>
          ) : null}

          <Panel delay={0.55}>
            <h2 className="mb-4 text-sm font-semibold">Delivering to</h2>
            <div className="flex flex-col gap-3 text-sm">
              <Detail icon={Phone}>
                <span className="font-medium">{order.contact.name}</span>
                <span className="block text-muted-foreground">
                  {order.contact.phone}
                </span>
              </Detail>

              <Detail icon={MapPin}>
                <span className="text-muted-foreground">
                  {[
                    order.shippingAddress.line1,
                    order.shippingAddress.line2,
                    order.shippingAddress.area,
                    order.shippingAddress.city,
                    order.shippingAddress.district,
                    order.shippingAddress.postalCode,
                    order.shippingAddress.country,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </Detail>

              <Detail icon={Truck}>
                <span className="text-muted-foreground">
                  Inside Dhaka in 24–48 hours, elsewhere in 2–4 days.
                </span>
              </Detail>

              {order.note ? (
                <Detail icon={Info}>
                  <span className="text-muted-foreground">“{order.note}”</span>
                </Detail>
              ) : null}
            </div>
          </Panel>

          <Panel delay={0.6} className="flex flex-col gap-3">
            <Button
              className="h-12 w-full shrink-0 cursor-pointer gap-2 rounded-field text-sm font-semibold"
              render={<Link href="/shop" />}
            >
              Continue shopping
              <ArrowRight className="size-4" aria-hidden />
            </Button>
            <Button
              variant="outline"
              className="h-12 w-full shrink-0 cursor-pointer gap-2 rounded-field text-sm font-semibold"
              render={
                <a
                  href={whatsappLink(
                    `Hi, I have a question about order ${order.orderNumber}.`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <Package className="size-4" aria-hidden />
              Ask about this order
            </Button>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/**
 * The tick.
 *
 * The check is an SVG path animated by its own `pathLength`, so it draws
 * itself rather than fading in - which is what makes it read as "done" instead
 * of "appeared". The ring behind it expands once and dissolves.
 *
 * Sized to sit beside the heading rather than above it: a 96px disc on its own
 * line is a headline, and the headline here is the confirmation.
 */
function Celebration({ reduceMotion }: { reduceMotion: boolean | null }) {
  return (
    <div className="relative flex size-14 shrink-0 items-center justify-center">
      {!reduceMotion && (
        <>
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-success/25"
            initial={{ scale: 0.6, opacity: 0.8 }}
            animate={{ scale: 2.1, opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          />
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-success/20"
            initial={{ scale: 0.6, opacity: 0.6 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 1.1, delay: 0.15, ease: "easeOut" }}
          />
        </>
      )}

      <motion.span
        className="relative flex size-14 items-center justify-center rounded-full bg-success/15 text-success"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-7"
          role="img"
          aria-label="Order placed"
        >
          <motion.path
            d="M20 6 9 17l-5-5"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: 0.2, ease: EASE_BRAND }}
          />
        </svg>
      </motion.span>
    </div>
  );
}

/** A card that arrives in sequence. */
function Panel({
  delay,
  className,
  children,
}: {
  delay: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE_BRAND }}
      className={cn("rounded-xl border bg-card p-5 sm:p-6", className)}
    >
      {children}
    </motion.section>
  );
}

/** What to say about the guest-to-account invitation, keyed on its status. */
function AccountInviteNote({ status }: { status: string }) {
  const copy: Record<string, { title: string; body: string }> = {
    VERIFICATION_SENT: {
      title: "Check your inbox",
      body: "We sent a link to finish setting up your account. Your guest orders will attach to it.",
    },
    ACCOUNT_EXISTS: {
      title: "You already have an account",
      body: "Sign in and this order will be there waiting.",
    },
    INVITATION_FAILED: {
      title: "Your order is placed",
      body: "We could not start the account setup, but that has no effect on the order.",
    },
  };

  const note = copy[status] ?? copy.INVITATION_FAILED!;

  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
        <CheckCircle2 className="size-4.5" aria-hidden />
      </span>
      <span>
        <span className="block text-sm font-semibold">{note.title}</span>
        <span className="block text-xs text-muted-foreground">{note.body}</span>
      </span>
    </div>
  );
}

function Detail({
  icon: Icon,
  children,
}: {
  icon: typeof Phone;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0">{children}</div>
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
  tone?: "default" | "success";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          tone === "success" ? "font-medium text-success" : "font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}
