import { api } from "@/lib/api/client";
import type { OrderStatus } from "@/lib/api/orders";

export interface DashboardRevenuePoint {
  month: string;
  revenue: number;
}

export interface DashboardKpi {
  key: string;
  label: string;
  value: number;
  delta: number;
  riseIsGood: boolean;
  format: "money" | "number" | "percent";
  hint: string;
}

export interface DashboardStatusCount {
  status: OrderStatus;
  count: number;
}

export interface DashboardRecentOrder {
  id: number;
  orderNumber: string;
  customer: string;
  customerImage: string | null;
  isGuestOrder: boolean;
  email: string | null;
  phone: string;
  city: string;
  status: OrderStatus;
  total: number;
  placedAt: string;
}

export interface DashboardStockLine {
  id: string;
  productId: string;
  product: string;
  variant: string;
  sku: string;
  stock: number;
  threshold: number;
}

export interface AdminDashboard {
  currency: string;
  generatedAt: string;
  range: {
    startDate: string;
    endDate: string;
  };
  revenueTrend: DashboardRevenuePoint[];
  kpis: DashboardKpi[];
  ordersByStatus: DashboardStatusCount[];
  recentOrders: DashboardRecentOrder[];
  lowStock: DashboardStockLine[];
}

export interface DashboardQuery {
  startDate?: string;
  endDate?: string;
}

export const adminDashboardApi = {
  async overview(query: DashboardQuery = {}): Promise<AdminDashboard> {
    const params = new URLSearchParams();
    if (query.startDate) params.set("startDate", query.startDate);
    if (query.endDate) params.set("endDate", query.endDate);

    const payload = await api<{ dashboard: AdminDashboard }>(
      `/admin/dashboard${params.size ? `?${params}` : ""}`,
    );
    return payload.data.dashboard;
  },
};
