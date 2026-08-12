"use strict";

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const cookieParser = require("cookie-parser");

const env = require("./config/env");
const { mountSwagger } = require("./config/swagger");
const requestContext = require("./middleware/requestContext");
const sanitize = require("./middleware/sanitize");
const { globalLimiter } = require("./middleware/rateLimiter");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");
const routes = require("./routes");
const ApiError = require("./shared/ApiError");

/**
 * Express app assembly.
 *
 * Kept separate from `server.js` (which owns the listening socket, the
 * database connection and shutdown) so tests can drive the app with supertest
 * without binding a port or needing a real Mongo.
 *
 * Middleware order is the load-bearing part of this file - see the comments
 * on each stage.
 */
function createApp() {
  const app = express();

  // 1. Proxy trust. Must come first: `req.ip` is wrong without it, and every
  //    IP-keyed rate limit downstream would either bucket the entire internet
  //    under the load balancer's address or be trivially spoofed by a
  //    client-supplied X-Forwarded-For. A hop count is used rather than
  //    `true`, which would trust the whole header chain.
  app.set("trust proxy", env.TRUST_PROXY_HOPS);

  app.disable("x-powered-by");
  app.set("json spaces", env.isProduction ? 0 : 2);

  // 2. Request id + structured logging, early enough that everything after it
  //    - including rejections from the limiter - is logged with an id.
  app.use(requestContext);

  // 3. Security headers.
  app.use(
    helmet({
      // Swagger UI needs inline styles/scripts; the API itself returns JSON,
      // where CSP is not the relevant control.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // 4. CORS against an explicit allow-list. `credentials: true` is what lets
  //    the browser send the refresh cookie, and it is precisely why the
  //    origin cannot be `*`.
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header: same-origin, curl, or a server-side call.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(ApiError.forbidden(`Origin ${origin} is not allowed`));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id", "RateLimit", "RateLimit-Policy", "Retry-After"],
      maxAge: 86_400,
    })
  );

  app.use(compression());

  // 5. Body parsing with a hard cap. Without a limit, one large POST can pin
  //    the event loop long before any rate limit notices.
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: true, limit: "100kb" }));
  app.use(cookieParser());

  // 6. Strip Mongo operators from anything a client sent.
  app.use(sanitize);

  // 7. Docs before the global limiter: a developer paging through Swagger UI
  //    should never exhaust the API budget with static asset requests.
  mountSwagger(app);

  // 8. Blanket rate limit, then the routes. Per-tier limiters live on the
  //    individual routes inside each module.
  app.use(env.API_PREFIX, globalLimiter, routes);

  // 9. Terminal handlers, in this order and always last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
