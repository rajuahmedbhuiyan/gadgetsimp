"use strict";

/**
 * A deliberately small user-agent parser.
 *
 * Orders record the device they were placed from, which support uses to make
 * sense of a complaint ("it showed a different price on my phone") and fraud
 * review uses as one weak signal among several. That job needs a coarse
 * label - Android, iOS, Windows - not the exact patch version of a browser
 * engine, so pulling in a full parsing library (a megabyte of regexes that
 * needs updating as browsers ship) would be paying a real maintenance cost
 * for precision nobody reads.
 *
 * Two rules keep this honest:
 *
 *   - The **raw string is always stored** alongside whatever this returns, so
 *     a wrong guess costs nothing - the original is right there to re-read.
 *   - Anything unrecognised is `null`, never a fallback like "Windows". A
 *     wrong label is worse than a missing one, because it gets believed.
 *
 * Nothing here is a security control. A user agent is client-supplied text
 * that anyone can set to anything; it is evidence, not identity.
 */

const OS_RULES = [
  // Windows 11 reports itself as Windows NT 10.0 - there is no way to tell
  // the two apart from the UA alone, so neither is claimed.
  [/windows nt 10/i, "Windows 10/11"],
  [/windows nt 6\.3/i, "Windows 8.1"],
  [/windows nt 6\.2/i, "Windows 8"],
  [/windows nt 6\.1/i, "Windows 7"],
  [/windows phone/i, "Windows Phone"],
  [/windows/i, "Windows"],
  // Order matters: iPhone and iPad UAs also contain "Mac OS X".
  [/iphone|ipod/i, "iOS"],
  [/ipad/i, "iPadOS"],
  [/android/i, "Android"],
  [/cros/i, "ChromeOS"],
  [/mac os x|macintosh/i, "macOS"],
  [/ubuntu/i, "Ubuntu"],
  [/linux/i, "Linux"],
];

const BROWSER_RULES = [
  // Every one of these also claims to be Chrome and Safari, so the specific
  // ones have to be tested first or everything reads as Chrome.
  [/edg(?:e|a|ios)?\//i, "Edge"],
  [/opr\/|opera/i, "Opera"],
  [/samsungbrowser/i, "Samsung Internet"],
  [/firefox|fxios/i, "Firefox"],
  [/chrome|crios/i, "Chrome"],
  [/safari/i, "Safari"],
];

function matchFirst(rules, value) {
  for (const [pattern, label] of rules) {
    if (pattern.test(value)) return label;
  }
  return null;
}

function detectDevice(value) {
  if (/ipad|tablet/i.test(value)) return "TABLET";
  if (/mobi|iphone|android.*mobile/i.test(value)) return "MOBILE";
  // Android without "Mobile" is conventionally a tablet.
  if (/android/i.test(value)) return "TABLET";
  if (/bot|crawler|spider|curl|wget|postman|insomnia/i.test(value)) return "BOT";
  if (/windows|mac os|linux|cros/i.test(value)) return "DESKTOP";
  return null;
}

/**
 * @param {string} [userAgent] The raw `User-Agent` header.
 * @returns {{userAgent: string|null, os: string|null, browser: string|null, device: string|null}}
 */
function parseUserAgent(userAgent) {
  if (typeof userAgent !== "string" || userAgent.trim() === "") {
    return { userAgent: null, os: null, browser: null, device: null };
  }

  // Bounded before anything else: the header is attacker-controlled and the
  // regexes below should never be handed an unbounded string.
  const value = userAgent.slice(0, 512);

  return {
    userAgent: value,
    os: matchFirst(OS_RULES, value),
    browser: matchFirst(BROWSER_RULES, value),
    device: detectDevice(value),
  };
}

/**
 * The full client fingerprint stored on an order.
 *
 * `req.ip` is correct only because the app sets `trust proxy` to a hop count -
 * see `app.js`. Without that it would be the load balancer's address on every
 * order, or worse, whatever the client put in `X-Forwarded-For`.
 */
function clientInfoFrom(req) {
  return {
    ip: req.ip ?? null,
    ...parseUserAgent(req.headers?.["user-agent"]),
  };
}

module.exports = { parseUserAgent, clientInfoFrom };
