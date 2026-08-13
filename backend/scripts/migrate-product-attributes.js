"use strict";

/**
 * Converts product attributes from the old flat map to grouped form.
 *
 *   before:  { "material": "cotton", "fit": "regular" }
 *   after:   [ { title: "General Info", options: { material: "cotton", fit: "regular" } } ]
 *
 * Every existing product needs this. Mongoose now types `attributes` as an
 * array of subdocuments, so a document still holding an object fails to cast
 * on read - the product does not merely look wrong, it becomes unreadable
 * through the API.
 *
 * **Dry run by default.** The opposite guard to `seed.js`: that script destroys
 * data and therefore refuses to touch a remote database, while this one exists
 * precisely to be run against production. So the safety is "show me first"
 * rather than "refuse":
 *
 *   node scripts/migrate-product-attributes.js              # report only
 *   node scripts/migrate-product-attributes.js --apply      # write
 *   node scripts/migrate-product-attributes.js --apply --title="Specification"
 *
 * Idempotent: products already holding an array are skipped, so re-running
 * after a partial failure finishes the job rather than double-wrapping it.
 *
 * Reads and writes through the **raw collection**, deliberately bypassing
 * Mongoose. The whole point is to touch documents whose current shape the
 * schema rejects, and casting them on the way in would fail before anything
 * could be fixed.
 */

const mongoose = require("mongoose");
const logger = require("../src/config/logger");
const { connectDatabase, disconnectDatabase } = require("../src/config/database");

const DEFAULT_TITLE = "General Info";

function parseArguments(argv) {
  const apply = argv.includes("--apply");
  const titleArgument = argv.find((argument) => argument.startsWith("--title="));

  return {
    apply,
    title: titleArgument ? titleArgument.slice("--title=".length).trim() : DEFAULT_TITLE,
  };
}

/**
 * Decides what one document's `attributes` should become.
 *
 * @returns {{action: "skip"|"convert"|"empty", groups?: Array}}
 */
function planFor(attributes, title) {
  // Already migrated, or a fresh product written by the new code.
  if (Array.isArray(attributes)) return { action: "skip" };

  // Never set, or explicitly empty - an empty array is the new equivalent and
  // is worth writing so every document ends up with one consistent type.
  if (attributes == null || typeof attributes !== "object") {
    return { action: "empty", groups: [] };
  }

  const options = { ...attributes };

  if (Object.keys(options).length === 0) return { action: "empty", groups: [] };

  return { action: "convert", groups: [{ title, options }] };
}

async function main() {
  const { apply, title } = parseArguments(process.argv.slice(2));

  if (!title) {
    logger.error("--title cannot be empty");
    process.exitCode = 1;
    return;
  }

  await connectDatabase();

  const collection = mongoose.connection.collection("products");

  const cursor = collection.find(
    // Anything that is not already an array. `$not` + `$type: "array"` also
    // catches documents missing the field entirely.
    { attributes: { $not: { $type: "array" } } },
    { projection: { _id: 1, name: 1, slug: 1, attributes: 1 } }
  );

  const counts = { scanned: 0, convert: 0, empty: 0, skip: 0 };
  const writes = [];
  const samples = [];

  for await (const product of cursor) {
    counts.scanned += 1;

    const plan = planFor(product.attributes, title);
    counts[plan.action] += 1;

    if (plan.action === "skip") continue;

    writes.push({
      updateOne: {
        filter: { _id: product._id },
        update: { $set: { attributes: plan.groups } },
      },
    });

    if (samples.length < 5) {
      samples.push({
        slug: product.slug,
        before: product.attributes,
        after: plan.groups,
      });
    }
  }

  logger.info(
    { database: mongoose.connection.name, ...counts, willWrite: writes.length, title },
    apply ? "Migrating product attributes" : "Dry run - nothing will be written"
  );

  for (const sample of samples) {
    logger.info(
      { slug: sample.slug, before: sample.before, after: sample.after },
      "Example conversion"
    );
  }

  if (writes.length === 0) {
    logger.info("Nothing to migrate.");
    return;
  }

  if (!apply) {
    logger.warn(
      `${writes.length} product(s) would be updated. Re-run with --apply to write.`
    );
    return;
  }

  // Unordered, so one bad document cannot stop the rest.
  const result = await collection.bulkWrite(writes, { ordered: false });

  logger.info({ modified: result.modifiedCount }, "Migration complete");
}

/**
 * Only runs when this file is the entry point.
 *
 * Without the guard, `require()`-ing it - to unit test `planFor`, or by
 * accident while poking at the codebase - would connect to whatever
 * MONGODB_URI points at and start migrating. That has happened here before
 * with the seed script, against a live database.
 */
if (require.main === module) {
  main()
    .catch((error) => {
      logger.error({ err: error }, "Migration failed");
      process.exitCode = 1;
    })
    .finally(async () => {
      await disconnectDatabase().catch(() => mongoose.connection.close().catch(() => {}));
    });
}

module.exports = { planFor, main };
