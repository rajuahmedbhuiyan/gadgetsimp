/**
 * Routes that run without the full storefront chrome.
 *
 * The shop is a working surface rather than a shop window: it has its own
 * filter sidebar sticking to the viewport, its own search box, and a grid that
 * virtualises against the window scroll. A sticky header and the promotional
 * top bar both eat vertical space that the sidebar and the grid want, and a
 * floating WhatsApp button lands on top of the scroll-to-top control.
 *
 * Exact matches only. `/shop/[slug]` is a product page - an ordinary shop
 * window - and keeps everything.
 */
const BARE_CHROME = new Set(["/shop", "/checkout", "/checkout/success"]);

export function hasBareChrome(pathname: string): boolean {
  return BARE_CHROME.has(pathname);
}

export function hasMobileTabChrome(pathname: string): boolean {
  if (pathname === "/checkout" || pathname === "/checkout/success") return false;
  if (pathname.startsWith("/shop/")) return false;
  return true;
}
