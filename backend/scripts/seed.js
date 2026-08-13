"use strict";

/**
 * Development seed: one account per role, all pre-verified.
 *
 * **This script deletes data.** It wipes the collections it owns before
 * writing, which is what makes it idempotent - and what makes it dangerous
 * pointed at the wrong database.
 *
 * Two guards, because `NODE_ENV=production` alone is not enough: a developer's
 * .env routinely has NODE_ENV=development while MONGODB_URI points at a shared
 * Atlas cluster, and that combination looks completely safe right up until it
 * erases everyone's data.
 *
 *   1. Never runs when NODE_ENV=production.
 *   2. Never runs against a non-local database unless SEED_CONFIRM=yes.
 *
 * Guard 2 exists because this script has already been run against a remote
 * database by accident.
 *
 *   npm run seed                    # local mongod
 *   SEED_CONFIRM=yes npm run seed   # anything else
 */

const mongoose = require("mongoose");
const env = require("../src/config/env");
const logger = require("../src/config/logger");
const {
  connectDatabase,
  disconnectDatabase,
  ensureIndexes,
} = require("../src/config/database");
const User = require("../src/modules/user/user.model");
const PendingRegistration = require("../src/modules/auth/pendingRegistration.model");
const { Counter } = require("../src/shared/sequence");
const { ROLES, USER_STATUS } = require("../src/shared/constants");

/**
 * A database is "local" only if it is on this machine. Anything else - Atlas,
 * a staging box, a colleague's tunnel - is treated as data somebody cares
 * about.
 */
function isLocalDatabase(uri) {
  return /^mongodb:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/)/.test(uri);
}

async function seed() {
  if (env.isProduction) {
    throw new Error("Refusing to seed a production database");
  }

  if (!isLocalDatabase(env.MONGODB_URI) && process.env.SEED_CONFIRM !== "yes") {
    const target = env.MONGODB_URI.replace(/\/\/[^@]*@/, "//<credentials>@");

    throw new Error(
      [
        "Refusing to seed a non-local database.",
        `  Target: ${target}`,
        "",
        "This script DELETES all users and pending registrations.",
        "If that is genuinely what you want, re-run with:",
        "",
        "  SEED_CONFIRM=yes npm run seed",
      ].join("\n")
    );
  }

  await connectDatabase();

  // The seed relies on the unique indexes to catch duplicate slugs and
  // emails, so build them before writing anything.
  await ensureIndexes();

  logger.info("Clearing users and pending signups");
  await Promise.all([
    User.deleteMany({}),
    PendingRegistration.deleteMany({}),
    // Reset the id sequence too, so a re-seed always produces the same ids
    // (1000, 1001, ...) and fixtures referencing them stay valid.
    Counter.deleteMany({}),
  ]);

  // Seeded accounts skip the email-verification flow deliberately - they are
  // created already verified so the API is usable without an inbox.
  const owner = await User.create({
    fullName: "Site Owner",
    email: "owner@gadgetsimp.dev",
    password: "Owner1234",
    role: ROLES.OWNER,
    status: USER_STATUS.ACTIVE,
    emailVerifiedAt: new Date(),
  });

  const admin = await User.create({
    fullName: "Store Admin",
    email: "admin@gadgetsimp.dev",
    password: "Admin1234",
    role: ROLES.ADMIN,
    emailVerifiedAt: new Date(),
  });

  await User.create({
    fullName: "Mina Rahman",
    email: "moderator@gadgetsimp.dev",
    password: "Moderator1234",
    role: ROLES.MODERATOR,
    emailVerifiedAt: new Date(),
  });

  await User.create({
    fullName: "Raju Ahmed",
    email: "customer@gadgetsimp.dev",
    password: "Customer1234",
    role: ROLES.CUSTOMER,
    phone: "+8801712345678",
    emailVerifiedAt: new Date(),
  });

  logger.info({ users: 4 }, "Seed complete");
  logger.info(`Owner     : owner@gadgetsimp.dev / Owner1234 (id ${owner.id})`);
  logger.info(`Admin     : admin@gadgetsimp.dev / Admin1234 (id ${admin.id})`);
  logger.info("Moderator : moderator@gadgetsimp.dev / Moderator1234");
  logger.info("Customer  : customer@gadgetsimp.dev / Customer1234");
}

seed()
  .then(async () => {
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.fatal({ err: error }, "Seed failed");
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
  });
