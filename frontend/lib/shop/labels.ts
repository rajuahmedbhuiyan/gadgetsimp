/**
 * Presentable names for filter values.
 *
 * The API humanises a slug by splitting on hyphens and capitalising each word,
 * which is right for `tempered-glass` and wrong for everything technical:
 * `ios` becomes "Ios", `usb-c` becomes "Usb C", `bluetooth-5-3` becomes
 * "Bluetooth 5 3". Those are the words a shopper scans a filter list for, so
 * they are worth getting right.
 *
 * Formatting runs off the slug rather than the API's label, because the slug
 * is the canonical form - `bluetooth-5-3` still carries the information that
 * `5` and `3` are one version number, which "Bluetooth 5 3" has already lost.
 *
 * Unknown values fall through to plain title case, so a value added to the
 * catalogue tomorrow reads sensibly without a code change.
 */

/** Slugs whose shape no general rule would get right. */
const EXACT: Record<string, string> = {
  "small-medium": "Small / Medium",
  none: "None",
};

/** Tokens with a fixed house style. */
const TOKENS: Record<string, string> = {
  ios: "iOS",
  iphone: "iPhone",
  ipad: "iPad",
  macbook: "MacBook",
  airpods: "AirPods",
  airtag: "AirTag",
  magsafe: "MagSafe",
  usb: "USB",
  hdmi: "HDMI",
  anc: "ANC",
  enc: "ENC",
  nfc: "NFC",
  gps: "GPS",
  led: "LED",
  oled: "OLED",
  rgb: "RGB",
  tws: "TWS",
  hd: "HD",
  uhd: "UHD",
  qi: "Qi",
  pd: "PD",
  otg: "OTG",
  aux: "AUX",
};

/** Unit suffixes glued to a number: `4ghz` -> `4GHz`, `20000mah` -> `20000mAh`. */
const UNITS: Record<string, string> = {
  ghz: "GHz",
  mhz: "MHz",
  mah: "mAh",
  wh: "Wh",
  w: "W",
  v: "V",
  a: "A",
  k: "K",
  mm: "mm",
  cm: "cm",
  m: "m",
  gb: "GB",
  tb: "TB",
};

/** `ip67` -> `IP67`, `ipx4` -> `IPX4`. One token, letters then digits. */
const RATING = /^(ipx?)(\d+)$/;

/** `4ghz` -> `4GHz`. Digits then a known unit. */
const NUMBER_UNIT = /^(\d+(?:\.\d+)?)([a-z]+)$/;

function formatToken(token: string): string {
  if (TOKENS[token]) return TOKENS[token];

  const rating = RATING.exec(token);
  if (rating) return rating[1]!.toUpperCase() + rating[2];

  const numbered = NUMBER_UNIT.exec(token);
  if (numbered && UNITS[numbered[2]!]) return numbered[1]! + UNITS[numbered[2]!];

  if (/^\d/.test(token)) return token;

  return token.charAt(0).toUpperCase() + token.slice(1);
}

/**
 * `bluetooth-5-3` -> `Bluetooth 5.3`, `usb-c` -> `USB-C`, `ip67` -> `IP67`.
 */
export function formatFilterValue(slug: string, fallback?: string): string {
  if (!slug) return fallback ?? "";

  const key = slug.toLowerCase();
  if (EXACT[key]) return EXACT[key];

  const tokens = key.split("-").filter(Boolean);
  if (tokens.length === 0) return fallback ?? slug;

  const out: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const previous = out.at(-1);

    /*
     * A number following a number is a version, not a second word:
     * `bluetooth-5-3` is one 5.3, and `wireless-2-4ghz` is one 2.4GHz. Joined
     * with a dot rather than a space, which is how both are written.
     */
    if (previous && /^\d/.test(token) && /\d$/.test(previous)) {
      out[out.length - 1] = `${previous}.${formatToken(token)}`;
      continue;
    }

    /*
     * A lone letter after a word is a suffix rather than a word of its own -
     * `usb-c` is USB-C, not "USB C". Hyphenated, which is how the connector
     * is actually written.
     */
    if (previous && token.length === 1 && /^[a-z]$/.test(token)) {
      out[out.length - 1] = `${previous}-${token.toUpperCase()}`;
      continue;
    }

    out.push(formatToken(token));
  }

  return out.join(" ");
}

/**
 * The name of a filter group. These come from admin-authored attribute
 * labels, which are already written for display - only the technical tokens
 * need correcting, so a label with no token to fix passes through untouched.
 */
export function formatFilterLabel(label: string): string {
  return label
    .split(" ")
    .map((word) => TOKENS[word.toLowerCase()] ?? word)
    .join(" ");
}
