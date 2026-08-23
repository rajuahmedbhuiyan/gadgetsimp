"use strict";

const env = require("./env");
const logger = require("./logger");

let timer = null;

function startKeepAlive() {
  if (!env.KEEP_ALIVE_URL) return;

  const intervalMs = env.KEEP_ALIVE_INTERVAL_MINUTES * 60 * 1000;

  async function ping() {
    try {
      const response = await fetch(env.KEEP_ALIVE_URL, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        logger.warn(
          { statusCode: response.status, url: env.KEEP_ALIVE_URL },
          "Keep-alive ping returned a non-2xx response"
        );
      }
    } catch (error) {
      logger.warn({ err: error, url: env.KEEP_ALIVE_URL }, "Keep-alive ping failed");
    }
  }

  timer = setInterval(ping, intervalMs);
  timer.unref();

  logger.info(
    { url: env.KEEP_ALIVE_URL, intervalMinutes: env.KEEP_ALIVE_INTERVAL_MINUTES },
    "Keep-alive cron started"
  );
}

function stopKeepAlive() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startKeepAlive, stopKeepAlive };
