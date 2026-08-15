/**
 * Placeholder numbers for the dashboard.
 *
 * **None of this is real, and nothing here calls the API.** The dashboard was
 * built as a design first, so the shapes below are the shapes the endpoints
 * will return - a revenue series keyed by month, orders in the staff shape
 * (`orderNumber`, `status`, `total`), stock counts per variant. Swapping in
 * `POST /admin/orders/filter` and friends should be a change of source, not a
 * rewrite of the components that read it.
 *
 * Every date is a literal rather than something derived from `Date.now()`: a
 * server render and the hydration that follows it have to agree, and "3 hours
 * ago" computed twice does not.
 */

import type { OrderStatus } from "@/lib/api/orders";

/** The shop trades in taka; the API sends a currency code per payload. */
export const DEMO_CURRENCY = "BDT";

/* --------------------------------- trend ---------------------------------- */

export interface RevenuePoint {
  /** Short month label, as the axis prints it. */
  month: string;
  /** Whole taka. */
  revenue: number;
}

/** Twelve months to August 2026. */
export const revenueTrend: RevenuePoint[] = [
  { month: "Sep", revenue: 412_000 },
  { month: "Oct", revenue: 468_000 },
  { month: "Nov", revenue: 604_000 },
  { month: "Dec", revenue: 731_000 },
  { month: "Jan", revenue: 522_000 },
  { month: "Feb", revenue: 487_000 },
  { month: "Mar", revenue: 596_000 },
  { month: "Apr", revenue: 655_000 },
  { month: "May", revenue: 612_000 },
  { month: "Jun", revenue: 704_000 },
  { month: "Jul", revenue: 668_000 },
  { month: "Aug", revenue: 793_000 },
];

/* ---------------------------------- kpis ---------------------------------- */

export interface Kpi {
  key: string;
  label: string;
  /** Pre-formatted: some are money, some are counts, one is a percentage. */
  value: string;
  /** Change on the previous month, in percent. Negative reads as a fall. */
  delta: number;
  /** Whether a rise is the good direction - returns go the other way. */
  riseIsGood: boolean;
  hint: string;
}

export const kpis: Kpi[] = [
  {
    key: "revenue",
    label: "Revenue",
    value: "৳793,000",
    delta: 18.7,
    riseIsGood: true,
    hint: "This month, delivered orders only",
  },
  {
    key: "orders",
    label: "Orders",
    value: "1,284",
    delta: 12.4,
    riseIsGood: true,
    hint: "Placed in the last 30 days",
  },
  {
    key: "customers",
    label: "New customers",
    value: "316",
    delta: -4.2,
    riseIsGood: true,
    hint: "First order in the last 30 days",
  },
  {
    key: "returns",
    label: "Return rate",
    value: "2.1%",
    delta: -0.6,
    riseIsGood: false,
    hint: "Returned or refused on delivery",
  },
];

/* -------------------------------- pipeline -------------------------------- */

export interface StatusCount {
  status: OrderStatus;
  count: number;
}

/** The queue as it stands, in workflow order. */
export const ordersByStatus: StatusCount[] = [
  { status: "PENDING", count: 46 },
  { status: "CONFIRMED", count: 128 },
  { status: "OUT_FOR_DELIVERY", count: 73 },
  { status: "DELIVERED", count: 1002 },
  { status: "RETURNED", count: 21 },
  { status: "CANCELED", count: 14 },
];

/* ------------------------------ recent orders ----------------------------- */

export interface RecentOrder {
  id: number;
  orderNumber: string;
  customer: string;
  city: string;
  status: OrderStatus;
  total: number;
  placedAt: string;
}

export const recentOrders: RecentOrder[] = [
  {
    id: 4821,
    orderNumber: "482193",
    customer: "Rahim Uddin",
    city: "Dhaka",
    status: "PENDING",
    total: 4_290,
    placedAt: "2026-08-15T09:42:00.000Z",
  },
  {
    id: 4820,
    orderNumber: "482088",
    customer: "Nusrat Jahan",
    city: "Chattogram",
    status: "CONFIRMED",
    total: 12_750,
    placedAt: "2026-08-15T08:05:00.000Z",
  },
  {
    id: 4819,
    orderNumber: "481976",
    customer: "Tanvir Hasan",
    city: "Sylhet",
    status: "OUT_FOR_DELIVERY",
    total: 2_150,
    placedAt: "2026-08-14T17:20:00.000Z",
  },
  {
    id: 4818,
    orderNumber: "481842",
    customer: "Farhana Akter",
    city: "Dhaka",
    status: "DELIVERED",
    total: 8_940,
    placedAt: "2026-08-14T11:58:00.000Z",
  },
  {
    id: 4817,
    orderNumber: "481730",
    customer: "Imran Chowdhury",
    city: "Rajshahi",
    status: "CANCELED",
    total: 1_690,
    placedAt: "2026-08-13T19:31:00.000Z",
  },
  {
    id: 4816,
    orderNumber: "481655",
    customer: "Sadia Islam",
    city: "Khulna",
    status: "DELIVERED",
    total: 5_480,
    placedAt: "2026-08-13T14:12:00.000Z",
  },
];

/* -------------------------------- low stock ------------------------------- */

export interface StockLine {
  id: string;
  product: string;
  variant: string;
  sku: string;
  stock: number;
  /** Below this the shop stops promising next-day delivery. */
  threshold: number;
}

export const lowStock: StockLine[] = [
  {
    id: "v-1",
    product: "Anker Soundcore R50i",
    variant: "Black",
    sku: "ANK-R50I-BLK",
    stock: 0,
    threshold: 10,
  },
  {
    id: "v-2",
    product: "Baseus 20W Charger",
    variant: "White · UK plug",
    sku: "BAS-20W-WHT",
    stock: 3,
    threshold: 15,
  },
  {
    id: "v-3",
    product: "Xiaomi Redmi Watch 5",
    variant: "Ivory",
    sku: "XIA-RW5-IVY",
    stock: 4,
    threshold: 12,
  },
  {
    id: "v-4",
    product: "UGREEN 10000mAh Power Bank",
    variant: "Grey",
    sku: "UGR-PB10-GRY",
    stock: 6,
    threshold: 20,
  },
  {
    id: "v-5",
    product: "JBL Tune 520BT",
    variant: "Blue",
    sku: "JBL-520-BLU",
    stock: 8,
    threshold: 12,
  },
];
