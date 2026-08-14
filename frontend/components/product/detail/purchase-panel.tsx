"use client";

/**
 * Price, options, quantity and the buy actions.
 *
 * The domain rules this has to respect, all of them enforced by the API:
 *
 *  - a VARIABLE product **requires** `variantId`, a SIMPLE one **refuses** it;
 *  - price, stock and photo all belong to the *variant*, not the product, so
 *    every figure here reads from the selection once one exists;
 *  - quantity is capped server-side to the lower of remaining stock and 100,
 *    and a cap comes back as an `adjustment` rather than an error.
 *
 * Nothing here recomputes a price. The discount percentage is the one
 * derivation, and it uses the same rounding as the card grid.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Minus, Plus, ShoppingCart, Zap } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa6";

import { cn } from "@/lib/utils";
import { discountPercent, formatPrice, humanise } from "@/lib/format";
import { siteConfig, whatsappLink } from "@/lib/config/site";
import type { ProductDetail, Variation } from "@/lib/api/shop";
import { useAuth } from "@/lib/auth/auth-context";
import { useAddToCart } from "@/hooks/use-add-to-cart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WishlistButton } from "@/components/product/wishlist-button";
import { StockLine } from "./stock-line";

/** The API's own ceiling per cart line. */
const MAX_PER_LINE = 100;

export function PurchasePanel({
  product,
  selected,
  onSelectVariant,
}: {
  product: ProductDetail;
  selected: Variation | null;
  onSelectVariant: (variant: Variation) => void;
}) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { mutateAsync, isPending, isSuccess } = useAddToCart();
  const [quantity, setQuantity] = useState(1);

  const isVariable = product.productType === "VARIABLE";
  // For a VARIABLE product every figure comes from the chosen SKU.
  const price = selected?.sellingPrice ?? product.sellingPrice;
  const wasPrice = selected?.originalPrice ?? product.originalPrice;
  const stock = selected?.stock ?? product.stock;
  const off = discountPercent(price, wasPrice);

  const purchasable = isVariable
    ? Boolean(selected) && stock.status === "IN_STOCK"
    : product.stock.status === "IN_STOCK";

  // `trackInventory: false` means the shop is not counting, not that it is
  // empty - only cap against a number the API is actually keeping.
  const ceiling = stock.trackInventory
    ? Math.min(stock.quantity, MAX_PER_LINE)
    : MAX_PER_LINE;
  const maxQuantity = Math.max(1, ceiling);

  async function addToCart() {
    if (!isAuthenticated) {
      router.push(`/login?next=/shop/${product.slug}`);
      return null;
    }

    return mutateAsync({
      productId: product.id,
      // Sent only for VARIABLE - the API rejects it on a SIMPLE product.
      ...(isVariable && selected ? { variantId: selected.id } : {}),
      quantity,
    });
  }

  async function buyNow() {
    try {
      const result = await addToCart();
      if (result) router.push("/cart");
    } catch {
      // `useAddToCart` has already surfaced the reason as a toast.
    }
  }

  /**
   * The message the WhatsApp button drops into the composer.
   *
   * Everything the shop needs to place the order by hand: what, which variant,
   * how many, at what price, and the SKU to look it up by. The link is built
   * from `siteConfig.url` rather than `window.location`, so the text is
   * identical whether it is composed before or after hydration.
   */
  const orderMessage = useMemo(() => {
    const lines = [
      `Hi ${siteConfig.name}, I'd like to order:`,
      "",
      `• ${product.name}`,
    ];

    if (selected) {
      const chosen = product.variantOptionKeys
        .map((key) => {
          const value = selected.options[key];
          return value ? `${humanise(key)}: ${humanise(value)}` : null;
        })
        .filter(Boolean)
        .join(", ");
      if (chosen) lines.push(`• ${chosen}`);
    }

    lines.push(
      `• Quantity: ${quantity}`,
      `• Price: ${formatPrice(price, product.currency)} each`,
      `• SKU: ${selected?.sku ?? product.sku}`,
      "",
      `${siteConfig.url}/shop/${product.slug}`,
    );

    return lines.join("\n");
  }, [product, selected, quantity, price]);

  return (
    <div className="flex flex-col gap-6">
      <PriceBlock price={price} wasPrice={wasPrice} off={off} currency={product.currency} />

      <StockLine stock={stock} awaitingChoice={isVariable && !selected} />

      {isVariable && (
        <VariantPicker
          product={product}
          selected={selected}
          onSelect={(variant) => {
            onSelectVariant(variant);
            // A new SKU has its own ceiling; carrying a quantity of 12 onto a
            // variant with 3 left would only earn a server-side adjustment.
            setQuantity(1);
          }}
        />
      )}

      {/*
       * Four equally-weighted buttons made it impossible to tell which one was
       * the point of the page, so there are now two, and two quiet actions:
       *
       *   Add to cart   the default, and the one the whole panel is sized for
       *   Buy it now    the same thing plus a redirect - secondary styling,
       *                 because it is a shortcut, not a different outcome
       *   Save          not a purchase at all, so not a button
       *   WhatsApp      a different channel entirely, so a link
       */}
      <div className="flex flex-col gap-3">
        <div className="flex items-stretch gap-3">
          <QuantityStepper
            value={quantity}
            max={maxQuantity}
            disabled={!purchasable}
            onChange={setQuantity}
          />

          <Button
            className="h-12 flex-1 cursor-pointer gap-2 rounded-field text-sm font-semibold"
            disabled={!purchasable || isPending}
            onClick={() => void addToCart()}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : isSuccess ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <ShoppingCart className="size-4" aria-hidden />
            )}
            {addLabel({ isPending, isSuccess, purchasable, isVariable, selected })}
          </Button>
        </div>

        <Button
          variant="outline"
          className="h-12 w-full cursor-pointer gap-2 rounded-field text-sm font-semibold hover:border-brand/50 hover:bg-brand/10"
          disabled={!purchasable || isPending}
          onClick={() => void buyNow()}
        >
          <Zap className="size-4" aria-hidden />
          Buy it now
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-1">
          <WishlistButton
            variant="inline"
            productId={product.id}
            productName={product.name}
          />

          {/* Never disabled: asking whether a sold-out item is coming back is
              exactly what this channel is for. */}
          <a
            href={whatsappLink(orderMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-field px-2 py-1.5 text-sm font-medium text-[#128C4A] transition-colors hover:underline hover:underline-offset-4 dark:text-[#25D366]"
          >
            <FaWhatsapp className="size-4.5" aria-hidden />
            Order on WhatsApp
          </a>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-4 text-xs">
        <Meta label="SKU" value={selected?.sku ?? product.sku} />
        {product.brandId?.name ? (
          <Meta label="Brand" value={product.brandId.name} />
        ) : null}
      </dl>
    </div>
  );
}

function addLabel({
  isPending,
  isSuccess,
  purchasable,
  isVariable,
  selected,
}: {
  isPending: boolean;
  isSuccess: boolean;
  purchasable: boolean;
  isVariable: boolean;
  selected: Variation | null;
}) {
  if (isPending) return "Adding…";
  if (isSuccess) return "Added to cart";
  if (isVariable && !selected) return "Choose an option";
  if (!purchasable) return "Out of stock";
  return "Add to cart";
}

function PriceBlock({
  price,
  wasPrice,
  off,
  currency,
}: {
  price: number;
  wasPrice?: number;
  off: number;
  currency: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="font-heading text-3xl font-bold text-price lg:text-4xl">
        {formatPrice(price, currency)}
      </span>
      {off > 0 && wasPrice ? (
        <>
          <span className="text-base text-muted-foreground line-through">
            {formatPrice(wasPrice, currency)}
          </span>
          <Badge className="bg-sale text-sale-foreground">−{off}%</Badge>
          <span className="w-full text-xs font-medium text-success">
            You save {formatPrice(wasPrice - price, currency)}
          </span>
        </>
      ) : null}
    </div>
  );
}

/**
 * One row of buttons per option axis.
 *
 * Values come from the variations themselves rather than a hardcoded list, so
 * a product that varies on colour *and* size renders two rows without this
 * component knowing what either means. A value whose only SKU is out of stock
 * stays clickable - the shopper is allowed to look at it, and the panel then
 * says why it cannot be bought.
 */
function VariantPicker({
  product,
  selected,
  onSelect,
}: {
  product: ProductDetail;
  selected: Variation | null;
  onSelect: (variant: Variation) => void;
}) {
  const axes = useMemo(
    () =>
      product.variantOptionKeys.map((key) => ({
        key,
        values: [
          ...new Set(
            product.variations
              .map((variation) => variation.options[key])
              .filter((value): value is string => Boolean(value)),
          ),
        ],
      })),
    [product.variantOptionKeys, product.variations],
  );

  /** The SKU matching the current selection with one axis swapped. */
  function variantFor(key: string, value: string) {
    const target = { ...(selected?.options ?? {}), [key]: value };
    return (
      product.variations.find((variation) =>
        Object.entries(target).every(
          ([axis, chosen]) => variation.options[axis] === chosen,
        ),
      ) ??
      // No exact match yet (nothing selected on the other axes) - fall back to
      // the first SKU carrying this value.
      product.variations.find((variation) => variation.options[key] === value)
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {axes.map(({ key, values }) => (
        <div key={key}>
          <p className="mb-2 text-sm font-medium">
            {humanise(key)}
            {selected?.options[key] ? (
              <span className="ml-1.5 font-normal text-muted-foreground">
                {humanise(selected.options[key])}
              </span>
            ) : null}
          </p>

          <div className="flex flex-wrap gap-2">
            {values.map((value) => {
              const variant = variantFor(key, value);
              const active = selected?.options[key] === value;
              const soldOut = variant?.stock.status !== "IN_STOCK";

              return (
                <button
                  key={value}
                  type="button"
                  disabled={!variant}
                  aria-pressed={active}
                  onClick={() => variant && onSelect(variant)}
                  className={cn(
                    "cursor-pointer rounded-field border-2 px-4 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-brand bg-brand/10 text-foreground"
                      : "border-border hover:border-brand/50 hover:bg-muted",
                    soldOut && "text-muted-foreground line-through",
                  )}
                >
                  {humanise(value)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function QuantityStepper({
  value,
  max,
  disabled,
  onChange,
}: {
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <div
      className={cn(
        "flex h-12 shrink-0 items-center rounded-field border",
        disabled && "opacity-50",
      )}
    >
      <StepButton
        label="Decrease quantity"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="size-4" aria-hidden />
      </StepButton>

      <span
        aria-live="polite"
        className="w-10 text-center text-sm font-semibold tabular-nums"
      >
        {value}
      </span>

      <StepButton
        label="Increase quantity"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-4" aria-hidden />
      </StepButton>
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
      className="flex size-11 cursor-pointer items-center justify-center rounded-field text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium">{value}</dd>
    </div>
  );
}
