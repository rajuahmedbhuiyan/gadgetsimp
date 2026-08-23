"use client";

import { useQuery } from "@tanstack/react-query";

import { adminDashboardApi } from "@/lib/api/admin/dashboard";

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

export function useAdminDashboard() {
  const range = currentMonthRange();

  const result = useQuery({
    queryKey: ["admin", "dashboard", range] as const,
    queryFn: () => adminDashboardApi.overview(range),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return {
    dashboard: result.data ?? null,
    isLoading: result.isPending,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}
