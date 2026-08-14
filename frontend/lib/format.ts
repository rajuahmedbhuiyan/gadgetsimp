/**
 * Money and number formatting.
 *
 * The API returns a currency code per product rather than assuming one shop
 * currency, so every formatter takes the code from the payload instead of
 * reading a global. Prices arrive as whole units - fractional taka is not a
 * thing on this catalog - so the default drops the decimals.
 */

/** `Intl.NumberFormat` is expensive to construct and cheap to reuse. */
const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string) {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      // `narrowSymbol` renders BDT as `৳` rather than the `BDT ` prefix, which
      // is what a Bangladeshi shopper expects to see on a price tag.
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    });
    currencyFormatters.set(currency, formatter);
  }
  return formatter;
}

export function formatPrice(amount: number, currency = "BDT") {
  try {
    return currencyFormatter(currency).format(amount);
  } catch {
    // An unknown ISO code throws rather than degrading; show the number.
    return `${currency} ${amount.toLocaleString("en-US")}`;
  }
}

/**
 * What the card prints as the price.
 *
 * A VARIABLE product spans its variants, and quoting only the cheapest reads
 * as a bait price when the shopper lands on the product page. When the range
 * collapses to a single figure it is printed as one.
 */
export function formatPriceRange(
  min: number,
  max: number,
  currency = "BDT",
) {
  return min === max
    ? formatPrice(min, currency)
    : `${formatPrice(min, currency)} – ${formatPrice(max, currency)}`;
}

/**
 * How much is off, as a whole percent.
 *
 * `POST /shop` sends `discountPercent` with each card, but `GET /shop/{slug}`
 * does not - it sends the two prices and leaves the arithmetic to the caller.
 * Rounding matches the server's so a card and its product page never disagree
 * by a point.
 */
export function discountPercent(sellingPrice: number, originalPrice?: number) {
  if (!originalPrice || originalPrice <= sellingPrice) return 0;
  return Math.round((1 - sellingPrice / originalPrice) * 100);
}

/**
 * `battery_life` -> `Battery life`, for spec keys the API stores as slugs.
 * Values get the same treatment: `usb-c` -> `Usb c` reads better than the raw
 * token in a table.
 */
export function humanise(value: string) {
  const spaced = value.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
