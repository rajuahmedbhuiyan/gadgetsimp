"use strict";

const pino = require("pino");
const env = require("./env");

/**
 * Structured logging. In production this emits newline-delimited JSON, which
 * is what log aggregators want. In development it is piped through
 * pino-pretty for human eyes.
 *
 * `redact` is not optional here: this is an ecommerce API, and request bodies
 * routinely carry passwords, tokens and addresses.
 */
const logger = pino({
  level: env.isTest ? "silent" : env.LOG_LEVEL,
  base: { service: "gadgetsimp-api" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.password",
      "*.currentPassword",
      "*.newPassword",
      "*.confirmPassword",
      "*.refreshToken",
      "*.accessToken",
    ],
    censor: "[redacted]",
  },
  /**
   * Pretty-printing runs in a worker thread, so it is enabled only for
   * development - the one place a human reads the output.
   *
   * Production emits raw JSON for the log aggregator. Tests skip it too, and
   * not merely as an optimisation: the worker is an open handle that keeps
   * the Node process alive after the suite finishes, so Jest hangs instead of
   * exiting.
   */
  transport:
    env.isProduction || env.isTest
      ? undefined
      : {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname,service" },
        },
});

module.exports = logger;
