"use strict";

/**
 * Jest global setup.
 *
 * Runs before every test file's module registry is evaluated, so the
 * environment is in place by the time `src/config/env.js` validates it.
 *
 * Tests run against an in-memory MongoDB rather than a shared dev database:
 * the suite is then hermetic, parallel-safe and cannot wipe anyone's data.
 * `??=` is used so an individual test file can opt into different settings by
 * assigning before it requires the app - which is how the rate limit suite
 * turns limiting back on.
 */

process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/gadgetsimp-test";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-long-enough-000000";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-long-enough-00000";
// Lowest permitted cost. Real rounds would add seconds to every auth test.
process.env.BCRYPT_ROUNDS ??= "10";
process.env.RATE_LIMIT_ENABLED ??= "false";
process.env.SWAGGER_ENABLED ??= "true";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

// Apply the same global Mongoose settings production uses. Connecting to the
// in-memory server without them would run tests under a different driver
// configuration - which is exactly how a query that passes CI fails on
// deploy. This module is env-free by design, so requiring it here does not
// freeze the environment before a test file can adjust it.
require("../src/config/mongooseOptions").applyMongooseOptions();

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "gadgetsimp-test" });

  // Build indexes through the same helper the server uses, so tests exercise
  // the real index set - unique constraints included - rather than a database
  // carrying nothing but `_id_`. Required lazily: this module pulls in
  // `config/env`, and importing it at the top of setup would freeze the
  // environment before a test file could adjust it.
  await require("../src/config/database").ensureIndexes();
});

afterEach(async () => {
  // Emails accumulate in the log transport across tests; clearing keeps
  // `verificationTokenFor` from finding a previous test's message.
  require("../src/config/mailer").clearSentMessages();

  // Truncate rather than drop, so indexes survive between tests - the text
  // index is what product search depends on.
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});
