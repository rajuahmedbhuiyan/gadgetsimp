"use strict";

const Order = require("../order/order.model");
const Product = require("../product/product.model");
const Variant = require("../product/variant.model");
const User = require("../user/user.model");
const {
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  PRODUCT_STATUS,
  USER_STATUS,
} = require("../../shared/constants");
const { presentOrder } = require("../order/order.service");

const CURRENCY = "BDT";
const MONTH_COUNT = 12;
const LOW_STOCK_LIMIT = 5;
const RECENT_ORDER_LIMIT = 6;

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function addMonths(date, count) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function monthLabel(date) {
  return date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

function resolveRange({ startDate, endDate } = {}) {
  const now = new Date();
  const start = startDate ?? startOfMonth(now);
  const end = endDate ? new Date(endDate.getTime() + 1) : endOfMonth(now);

  return { start, end };
}

function previousRange(start, end) {
  const duration = end.getTime() - start.getTime();

  return {
    start: new Date(start.getTime() - duration),
    end: start,
  };
}

function percentChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function formatOptions(options) {
  if (!options) return "Default";

  const entries =
    options instanceof Map ? [...options.entries()] : Object.entries(options);

  if (entries.length === 0) return "Default";

  return entries.map(([, value]) => String(value)).join(" / ");
}

function presentStockLine(row) {
  const stock = row.stock ?? {};

  return {
    id: String(row._id),
    productId: String(row.productId?._id ?? row.productId),
    product: row.productId?.name ?? row.product ?? "Product",
    variant: row.variant ?? formatOptions(row.options),
    sku: row.sku ?? "",
    stock: stock.quantity ?? 0,
    threshold: stock.lowStockThreshold ?? 0,
  };
}

async function revenueTrend(now) {
  const firstMonth = addMonths(startOfMonth(now), -(MONTH_COUNT - 1));
  const nextMonth = addMonths(startOfMonth(now), 1);

  const rows = await Order.aggregate([
    {
      $match: {
        deletedAt: null,
        status: ORDER_STATUS.DELIVERED,
        placedAt: { $gte: firstMonth, $lt: nextMonth },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m",
            date: "$placedAt",
            timezone: "UTC",
          },
        },
        revenue: { $sum: "$total" },
      },
    },
  ]);

  const totals = new Map(rows.map((row) => [row._id, row.revenue]));

  return Array.from({ length: MONTH_COUNT }, (_, index) => {
    const date = addMonths(firstMonth, index);

    return {
      month: monthLabel(date),
      revenue: totals.get(monthKey(date)) ?? 0,
    };
  });
}

async function totalForPeriod(Model, filter, from, to) {
  return Model.countDocuments({
    ...filter,
    createdAt: { $gte: from, $lt: to },
  });
}

async function orderCountForPeriod(from, to) {
  return Order.countDocuments({
    deletedAt: null,
    placedAt: { $gte: from, $lt: to },
  });
}

async function deliveredRevenueForPeriod(from, to) {
  const [row] = await Order.aggregate([
    {
      $match: {
        deletedAt: null,
        status: ORDER_STATUS.DELIVERED,
        placedAt: { $gte: from, $lt: to },
      },
    },
    { $group: { _id: null, total: { $sum: "$total" } } },
  ]);

  return row?.total ?? 0;
}

async function returnRateForPeriod(from, to) {
  const rows = await Order.aggregate([
    {
      $match: {
        deletedAt: null,
        placedAt: { $gte: from, $lt: to },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        returned: {
          $sum: {
            $cond: [{ $eq: ["$status", ORDER_STATUS.RETURNED] }, 1, 0],
          },
        },
      },
    },
  ]);

  const row = rows[0];
  if (!row?.total) return 0;
  return Number(((row.returned / row.total) * 100).toFixed(1));
}

async function kpis(start, end) {
  const previous = previousRange(start, end);

  const [
    currentRevenue,
    previousRevenue,
    currentOrders,
    previousOrders,
    currentCustomers,
    previousCustomers,
    currentReturnRate,
    previousReturnRate,
  ] = await Promise.all([
    deliveredRevenueForPeriod(start, end),
    deliveredRevenueForPeriod(previous.start, previous.end),
    orderCountForPeriod(start, end),
    orderCountForPeriod(previous.start, previous.end),
    totalForPeriod(User, { status: { $ne: USER_STATUS.DELETED } }, start, end),
    totalForPeriod(User, { status: { $ne: USER_STATUS.DELETED } }, previous.start, previous.end),
    returnRateForPeriod(start, end),
    returnRateForPeriod(previous.start, previous.end),
  ]);

  return [
    {
      key: "revenue",
      label: "Revenue",
      value: currentRevenue,
      delta: percentChange(currentRevenue, previousRevenue),
      riseIsGood: true,
      format: "money",
      hint: "Selected range, delivered orders only",
    },
    {
      key: "orders",
      label: "Orders",
      value: currentOrders,
      delta: percentChange(currentOrders, previousOrders),
      riseIsGood: true,
      format: "number",
      hint: "Placed in the selected range",
    },
    {
      key: "customers",
      label: "New customers",
      value: currentCustomers,
      delta: percentChange(currentCustomers, previousCustomers),
      riseIsGood: true,
      format: "number",
      hint: "Created in the selected range",
    },
    {
      key: "returns",
      label: "Return rate",
      value: currentReturnRate,
      delta: Number((currentReturnRate - previousReturnRate).toFixed(1)),
      riseIsGood: false,
      format: "percent",
      hint: "Returned orders in the selected range",
    },
  ];
}

async function ordersByStatus(start, end) {
  const rows = await Order.aggregate([
    { $match: { deletedAt: null, placedAt: { $gte: start, $lt: end } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const totals = new Map(rows.map((row) => [row._id, row.count]));

  return ORDER_STATUS_VALUES.map((status) => ({
    status,
    count: totals.get(status) ?? 0,
  }));
}

async function recentOrders(start, end) {
  const rows = await Order.find({
    deletedAt: null,
    placedAt: { $gte: start, $lt: end },
  })
    .sort({ placedAt: -1 })
    .limit(RECENT_ORDER_LIMIT)
    .lean();

  const userIds = rows.map((row) => row.userId).filter((id) => id != null);
  const users = await User.find({ _id: { $in: userIds } })
    .select("fullName email image")
    .lean();
  const usersById = new Map(users.map((user) => [user._id, user]));

  return rows.map((row) => {
    const order = presentOrder(row, { forStaff: true });
    const user = usersById.get(order.userId);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customer: order.contact.name,
      customerImage: user?.image ?? null,
      isGuestOrder: order.isGuestOrder,
      email: order.email ?? user?.email ?? null,
      phone: order.contact.phone,
      city: order.shippingAddress.city,
      status: order.status,
      total: order.total,
      placedAt: order.placedAt,
    };
  });
}

async function lowStock() {
  const productRows = await Product.find({
    deletedAt: null,
    status: { $ne: PRODUCT_STATUS.DRAFT },
    "stock.trackInventory": true,
    $expr: { $lte: ["$stock.quantity", "$stock.lowStockThreshold"] },
  })
    .select("name sku stock")
    .sort({ "stock.quantity": 1, updatedAt: -1 })
    .limit(LOW_STOCK_LIMIT)
    .lean();

  const variantRows = await Variant.find({
    deletedAt: null,
    status: { $ne: PRODUCT_STATUS.DRAFT },
    "stock.trackInventory": true,
    $expr: { $lte: ["$stock.quantity", "$stock.lowStockThreshold"] },
  })
    .select("productId sku options stock")
    .populate({ path: "productId", select: "name" })
    .sort({ "stock.quantity": 1, updatedAt: -1 })
    .limit(LOW_STOCK_LIMIT)
    .lean();

  return [...productRows, ...variantRows]
    .map((row) =>
      presentStockLine(
        row.productId
          ? row
          : { ...row, productId: row._id, product: row.name, variant: "Default" }
      )
    )
    .sort((a, b) => a.stock / Math.max(a.threshold, 1) - b.stock / Math.max(b.threshold, 1))
    .slice(0, LOW_STOCK_LIMIT);
}

async function getDashboard(rangeInput) {
  const now = new Date();
  const { start, end } = resolveRange(rangeInput);

  const [trend, metrics, statusRows, latestOrders, stockRows] = await Promise.all([
    revenueTrend(now),
    kpis(start, end),
    ordersByStatus(start, end),
    recentOrders(start, end),
    lowStock(),
  ]);

  return {
    currency: CURRENCY,
    generatedAt: now.toISOString(),
    range: {
      startDate: start.toISOString(),
      endDate: new Date(end.getTime() - 1).toISOString(),
    },
    revenueTrend: trend,
    kpis: metrics,
    ordersByStatus: statusRows,
    recentOrders: latestOrders,
    lowStock: stockRows,
  };
}

module.exports = { getDashboard };
