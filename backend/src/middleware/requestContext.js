"use strict";

const crypto = require("node:crypto");
const pinoHttp = require("pino-http");
const logger = require("../config/logger");

/**
 * Gives every request an id and a child logger.
 *
 * The id is echoed back as `X-Request-Id`, so when a shopper reports a failed
 * checkout the support ticket carries the exact key needed to pull that one
 * request out of the logs. An inbound `X-Request-Id` is honoured, which keeps
 * the trace intact when the Next.js frontend calls the API on the user's behalf.
 */
const requestContext = pinoHttp({
  logger,

  genReqId(req, res) {
    const incoming = req.headers["x-request-id"];
    const id = typeof incoming === "string" && incoming.length <= 128 ? incoming : crypto.randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },

  // Health checks and the docs UI would otherwise dominate the log volume.
  autoLogging: {
    ignore: (req) => req.url.includes("/health") || req.url.includes("/docs"),
  },

  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },

  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },

  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

module.exports = requestContext;
