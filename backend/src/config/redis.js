"use strict";

const env = require("./env");
const logger = require("./logger");

/**
 * Redis is optional infrastructure here, and that is a deliberate design
 * choice rather than an omission.
 *
 * Rate limiting works without it (counters in process memory), so a developer
 * can clone the repo and run the API with nothing but Mongo. But in-memory
 * counters are per-process: two instances behind a load balancer each allow
 * the full quota, and a restart wipes the window. As soon as REDIS_URL is
 * set, the limiters switch to a shared store with no code change.
 */

let client = null;

function getRedisClient() {
  if (!env.REDIS_URL) return null;
  if (client) return client;

  // Required lazily so the dependency is never loaded when unused.
  const Redis = require("ioredis");

  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  });

  client.on("connect", () => logger.info("Redis connected"));
  client.on("error", (error) =>
    // Do not crash the API because the rate-limit store blinked. The limiter
    // falls back to allowing the request; availability beats strictness here.
    logger.error({ err: error }, "Redis error")
  );

  return client;
}

async function disconnectRedis() {
  if (!client) return;
  await client.quit().catch(() => client.disconnect());
  client = null;
}

module.exports = { getRedisClient, disconnectRedis };
