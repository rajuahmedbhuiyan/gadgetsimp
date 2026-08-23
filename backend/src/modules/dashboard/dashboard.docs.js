"use strict";

/**
 * OpenAPI description of the staff dashboard. Documentation only.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     DashboardKpi:
 *       type: object
 *       properties:
 *         key:
 *           type: string
 *           enum: [revenue, orders, customers, returns]
 *           example: revenue
 *         label: { type: string, example: Revenue }
 *         value: { type: number, example: 126500 }
 *         delta:
 *           type: number
 *           description: Percent change from the previous period, except return rate which is percentage-point change.
 *           example: 18.4
 *         riseIsGood: { type: boolean, example: true }
 *         format: { type: string, enum: [money, number, percent], example: money }
 *         hint: { type: string, example: Selected range, delivered orders only }
 *
 *     DashboardRevenuePoint:
 *       type: object
 *       properties:
 *         month: { type: string, example: Aug }
 *         revenue: { type: number, example: 42000 }
 *
 *     DashboardOrderStatusCount:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [PENDING, CONFIRMED, OUT_FOR_DELIVERY, DELIVERED, RETURNED, CANCELED]
 *           example: PENDING
 *         count: { type: integer, example: 12 }
 *
 *     DashboardRecentOrder:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 1000 }
 *         orderNumber: { type: string, example: GS-482915 }
 *         customer: { type: string, example: Nadia Islam }
 *         customerImage: { type: string, nullable: true, example: https://res.cloudinary.com/demo/image/upload/avatar.webp }
 *         isGuestOrder: { type: boolean, example: false }
 *         email: { type: string, nullable: true, format: email, example: nadia@example.com }
 *         phone: { type: string, example: '+8801712345678' }
 *         city: { type: string, example: Dhaka }
 *         status:
 *           type: string
 *           enum: [PENDING, CONFIRMED, OUT_FOR_DELIVERY, DELIVERED, RETURNED, CANCELED]
 *           example: CONFIRMED
 *         total: { type: number, example: 18500 }
 *         placedAt: { type: string, format: date-time }
 *
 *     DashboardLowStockItem:
 *       type: object
 *       properties:
 *         id: { type: string, example: 66e8f527af9a3b44a4a50d11 }
 *         productId: { type: string, example: 66e8f527af9a3b44a4a50d10 }
 *         product: { type: string, example: Pixel 9 Pro }
 *         variant: { type: string, example: Obsidian / 256GB }
 *         sku: { type: string, example: PIXEL-9-PRO-OBS-256 }
 *         stock: { type: integer, example: 2 }
 *         threshold: { type: integer, example: 5 }
 *
 *     DashboardOverview:
 *       type: object
 *       properties:
 *         currency: { type: string, example: BDT }
 *         generatedAt: { type: string, format: date-time }
 *         range:
 *           type: object
 *           properties:
 *             startDate: { type: string, format: date-time }
 *             endDate: { type: string, format: date-time }
 *         revenueTrend:
 *           type: array
 *           items: { $ref: '#/components/schemas/DashboardRevenuePoint' }
 *         kpis:
 *           type: array
 *           items: { $ref: '#/components/schemas/DashboardKpi' }
 *         ordersByStatus:
 *           type: array
 *           items: { $ref: '#/components/schemas/DashboardOrderStatusCount' }
 *         recentOrders:
 *           type: array
 *           items: { $ref: '#/components/schemas/DashboardRecentOrder' }
 *         lowStock:
 *           type: array
 *           items: { $ref: '#/components/schemas/DashboardLowStockItem' }
 *
 * /admin/dashboard:
 *   get:
 *     tags: [Dashboard]
 *     summary: Staff dashboard overview
 *     description: >
 *       MODERATOR and above. Returns the first screen of the back-office
 *       dashboard: KPI cards for the selected range, a 12-month delivered
 *       revenue trend, order status counts, recent orders and the lowest stock
 *       lines that need attention.
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *         description: Inclusive start of the KPI/status/recent-order range. Defaults to the start of the current month.
 *         example: '2026-08-01T00:00:00.000Z'
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *         description: Inclusive end of the KPI/status/recent-order range. Defaults to the end of the current month.
 *         example: '2026-08-31T23:59:59.999Z'
 *     responses:
 *       200:
 *         description: Dashboard overview.
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
 *                         dashboard: { $ref: '#/components/schemas/DashboardOverview' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
