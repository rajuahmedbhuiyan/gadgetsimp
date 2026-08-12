"use strict";

const mongoose = require("mongoose");

/**
 * Process-wide Mongoose settings, deliberately free of any dependency on
 * `config/env`.
 *
 * They live in their own module so the test harness can apply exactly the
 * same driver configuration as production without dragging in environment
 * loading. Requiring `config/database` for this would evaluate `config/env`
 * and freeze the environment before a test file has had a chance to set it.
 */
function applyMongooseOptions() {
  // Fail fast instead of buffering queries for 10s when Mongo is unreachable.
  mongoose.set("bufferCommands", false);

  // Silently dropping filter keys that are not in the schema hides typos;
  // strictQuery keeps queries honest.
  mongoose.set("strictQuery", true);

  /**
   * A note on `sanitizeFilter`, because its absence here is deliberate.
   *
   * Setting it globally looks like free protection against query-selector
   * injection, but it rewrites *every* object-valued filter into `$eq` - so
   * `{ price: { $gte: 500 } }` silently becomes a search for a literal object,
   * and `$text` is rejected outright. It would break price ranges, `$in`
   * category filters, the `$regex` subtree lookups and full-text search, and
   * it surfaces as a runtime CastError rather than at review time.
   *
   * The injection it defends against is stopped earlier and more precisely:
   *   - `middleware/sanitize.js` deletes `$`-prefixed keys from body, query
   *     and params before anything reads them;
   *   - every route validates with a strict Zod schema, so a field typed as a
   *     string rejects `{ "$gt": "" }` outright.
   *
   * Where a filter really is built from raw user input, apply it per-query
   * with `.setOptions({ sanitizeFilter: true })` rather than globally.
   */
}

module.exports = { applyMongooseOptions };
