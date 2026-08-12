"use strict";

const crypto = require("node:crypto");

/**
 * Generates a random password that satisfies the account password policy.
 *
 * Two properties matter here, and both are easy to get wrong:
 *
 *   1. **Cryptographic randomness.** `Math.random()` is seeded predictably
 *      and is not safe for anything that guards an account. `randomInt` draws
 *      from the CSPRNG and is free of the modulo bias you get from
 *      `randomBytes()[i] % alphabet.length`.
 *
 *   2. **Guaranteed policy compliance.** The validator demands a lowercase
 *      letter, an uppercase letter and a digit. Drawing purely at random
 *      usually satisfies that but not always, and a generator that
 *      occasionally emits a password the system then rejects is a bug that
 *      shows up rarely and confusingly. So one character of each class is
 *      placed first, then the remainder filled and the whole thing shuffled.
 *
 * Visually ambiguous characters (0/O, 1/l/I) are excluded: a generated
 * password gets read off a screen and retyped, sometimes dictated aloud.
 */

const LOWER = "abcdefghijkmnopqrstuvwxyz"; // no l
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O
const DIGITS = "23456789"; // no 0, 1
const SYMBOLS = "!@#$%^&*-_=+";

const ALPHABET = LOWER + UPPER + DIGITS + SYMBOLS;

const DEFAULT_LENGTH = 16;

function pick(source) {
  return source[crypto.randomInt(source.length)];
}

/**
 * @param {number} [length] Total characters. 16 gives ample entropy while
 *   staying short enough to retype without resentment.
 */
function generatePassword(length = DEFAULT_LENGTH) {
  if (length < 8) throw new Error("Generated passwords must be at least 8 characters");

  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];

  const rest = Array.from({ length: length - required.length }, () => pick(ALPHABET));

  return shuffle([...required, ...rest]).join("");
}

/**
 * Fisher-Yates, drawing each swap index from the CSPRNG. Sorting by a random
 * comparator - the common shortcut - produces a biased, non-uniform shuffle,
 * which here would mean the required characters cluster predictably.
 */
function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

module.exports = { generatePassword, DEFAULT_LENGTH };
