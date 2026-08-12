"use strict";

const env = require("./config/env");
const logger = require("./config/logger");
const { connectDatabase, disconnectDatabase, ensureIndexes } = require("./config/database");
const { disconnectRedis } = require("./config/redis");
const { verifyMailer, closeMailer } = require("./config/mailer");
const { verifyCloudinary } = require("./config/cloudinary");
const createApp = require("./app");

/**
 * Process lifecycle: connect dependencies, listen, and shut down cleanly.
 *
 * The database connection is established *before* the socket opens. Binding
 * first would mean the platform's health check passes and traffic is routed
 * to an instance that cannot serve a single request.
 */
async function start() {
  await connectDatabase();

  // Creating the app is what requires the feature modules, and therefore what
  // registers the Mongoose models. Index building has to come after that, and
  // before the socket opens - serving search traffic against a collection
  // whose text index has not been built yet just returns 500s.
  const app = createApp();
  await ensureIndexes();

  // Checked at boot, not on the first signup. Bad SMTP credentials would
  // otherwise surface as a failed registration for a real user.
  await verifyMailer().catch((error) => {
    logger.error({ err: error }, "SMTP verification failed - signup emails will not send");
  });

  // Same reasoning: bad Cloudinary credentials should surface here rather than
  // as a failed upload for a real user. Non-fatal, because the rest of the API
  // works fine without media.
  await verifyCloudinary().catch((error) => {
    logger.error({ err: error }, "Cloudinary verification failed - uploads will not work");
  });

  const server = app.listen(env.PORT, () => {
    logger.info(
      `GadgetSimp API listening on http://localhost:${env.PORT}${env.API_PREFIX} [${env.NODE_ENV}]`
    );
    if (env.SWAGGER_ENABLED) {
      logger.info(`API docs: http://localhost:${env.PORT}${env.API_PREFIX}/docs`);
    }
  });

  // Slightly above the typical 60s ALB/ingress idle timeout, so the proxy
  // closes idle connections first and clients never see a truncated response.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  registerShutdownHandlers(server);

  return server;
}

/**
 * Graceful shutdown.
 *
 * On SIGTERM the platform has already stopped sending new traffic. Draining
 * in-flight requests before closing Mongo is what stops a deploy from killing
 * a checkout halfway through.
 */
function registerShutdownHandlers(server) {
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`${signal} received - shutting down gracefully`);

    // Hard deadline: if a request hangs, exit anyway rather than let the
    // orchestrator SIGKILL us at an arbitrary point.
    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out - forcing exit");
      process.exit(1);
    }, 15_000);
    forceExit.unref();

    try {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      logger.info("HTTP server closed");

      // closeMailer releases the pooled SMTP connections; without it the
      // process can linger holding open sockets to Gmail.
      await Promise.allSettled([disconnectDatabase(), disconnectRedis(), closeMailer()]);
      logger.info("Dependencies disconnected");

      clearTimeout(forceExit);
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, "Error during shutdown");
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // An unhandled rejection or uncaught exception leaves the process in an
  // unknown state. Log it, then let the supervisor restart us on a clean one.
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "Unhandled promise rejection");
    shutdown("unhandledRejection");
  });

  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception");
    shutdown("uncaughtException");
  });
}

if (require.main === module) {
  start().catch((error) => {
    logger.fatal({ err: error }, "Failed to start server");
    process.exit(1);
  });
}

module.exports = { start };
