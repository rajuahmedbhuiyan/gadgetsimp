"use strict";

const express = require("express");
const mongoose = require("mongoose");
const authRoutes = require("../modules/auth/auth.routes");
const userRoutes = require("../modules/user/user.routes");
const { sendResponse } = require("../shared/sendResponse");

const router = express.Router();

/**
 * The API surface, versioned by mount prefix (`/api/v1`).
 *
 * Adding a feature is adding one entry to this table and one folder under
 * `modules/` - no other file needs to change. Catalog, cart and orders slot
 * in here the same way when they are built.
 */
const modules = [
  { path: "/auth", router: authRoutes },
  { path: "/users", router: userRoutes },
];

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Liveness and dependency check
 *     description: >
 *       Returns 200 only when the database is actually reachable, so an
 *       orchestrator restarts a pod that has lost Mongo instead of leaving it
 *       in the load balancer answering every request with a 500.
 *     security: []
 *     responses:
 *       200:
 *         description: Service healthy.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         uptime: { type: number, example: 1043.22 }
 *                         database: { type: string, example: connected }
 *                         timestamp: { type: string, format: date-time }
 *       503:
 *         description: A dependency is unavailable.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/health", (req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  const dbState = states[mongoose.connection.readyState] ?? "unknown";
  const healthy = mongoose.connection.readyState === 1;

  if (!healthy) {
    // Written by hand rather than thrown, because a readiness probe must
    // answer even when the error pipeline's dependencies are the problem.
    // The shape still matches the standard error envelope.
    return res.status(503).json({
      success: false,
      statusCode: 503,
      message: "Service unavailable",
      code: "SERVICE_UNAVAILABLE",
      errors: [{ field: "database", message: `Database is ${dbState}` }],
    });
  }

  return sendResponse(res, {
    message: "GadgetSimp API is running",
    data: {
      uptime: Number(process.uptime().toFixed(2)),
      database: dbState,
      timestamp: new Date().toISOString(),
    },
  });
});

for (const { path, router: moduleRouter } of modules) {
  router.use(path, moduleRouter);
}

module.exports = router;
