"use strict";

const mongoose = require("mongoose");
const env = require("./env");
const logger = require("./logger");
const { applyMongooseOptions } = require("./mongooseOptions");

applyMongooseOptions();

async function connectDatabase() {
  // A URI ending `.../?params` with nothing between the slash and the query
  // string carries no database name, so the driver quietly uses `test`. The
  // app works, data is written, and it is all in the wrong database - worth a
  // warning rather than a silent surprise weeks later.
  if (!/\/[^/?]+(\?|$)/.test(env.MONGODB_URI.replace(/^mongodb(\+srv)?:\/\//, "").split("@").pop())) {
    logger.warn(
      "MONGODB_URI has no database name - defaulting to `test`. Add one before the '?', e.g. .../gadgetsimp?retryWrites=true"
    );
  }

  mongoose.connection.on("connected", () => {
    logger.info("MongoDB connected");
  });

  mongoose.connection.on("error", (error) => {
    logger.error({ err: error }, "MongoDB connection error");
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: 20,
    minPoolSize: 2,
    autoIndex: !env.isProduction, // build indexes via migration in production
  });

  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.connection.close(false);
}

/**
 * Builds every schema index, and waits for it.
 *
 * Mongoose's `autoIndex` is not enough on its own here. It fires when a model
 * is compiled, it is not awaited, and with `bufferCommands` disabled it is
 * skipped entirely for models compiled outside a live connection. The result
 * is a database carrying nothing but `_id_`: unique constraints unenforced,
 * `$text` search failing outright, and listing queries silently falling back
 * to collection scans - none of which shows up until traffic does.
 *
 * Call this *after* the models have been required, which is why it is a
 * separate step rather than part of `connectDatabase`.
 *
 * Production uses `createIndexes` (additive) rather than `syncIndexes`
 * (which drops any index not in the schema) so an index added deliberately by
 * an operator is never removed by a deploy.
 */
async function ensureIndexes() {
  const models = Object.values(mongoose.models);

  if (models.length === 0) {
    logger.warn("ensureIndexes called before any model was registered");
    return;
  }

  const results = await Promise.allSettled(
    models.map(async (model) => {
      await (env.isProduction ? model.createIndexes() : model.syncIndexes());
      return model.modelName;
    })
  );

  const failures = results.filter((result) => result.status === "rejected");

  for (const failure of failures) {
    logger.error({ err: failure.reason }, "Index build failed");
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} model index build(s) failed`);
  }

  logger.info({ models: models.map((model) => model.modelName) }, "Indexes ensured");
}

/**
 * Runs `work` inside a transaction when the deployment supports them
 * (replica set / Atlas), and falls back to a plain call on a standalone
 * mongod so local development still works.
 *
 * Any service that must not half-apply a multi-document write (checkout and
 * stock decrement being the obvious ones) routes through here rather than
 * issuing loose writes.
 */
async function withTransaction(work) {
  const session = await mongoose.startSession();

  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    const unsupported =
      error?.code === 20 ||
      /Transaction numbers are only allowed|replica set|Sessions are not supported/i.test(
        error?.message ?? ""
      );

    if (unsupported) {
      logger.warn(
        "Transactions unsupported on this MongoDB deployment - running without one. Use a replica set in production."
      );
      return work(null);
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

module.exports = { connectDatabase, disconnectDatabase, ensureIndexes, withTransaction };
