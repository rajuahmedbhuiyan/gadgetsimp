"use client";

import { RefreshCw } from "lucide-react";

import { KpiRow } from "@/components/panel/dashboard/kpi-row";
import { LowStockCard } from "@/components/panel/dashboard/low-stock-card";
import { OrderPipeline } from "@/components/panel/dashboard/order-pipeline";
import { RecentOrdersCard } from "@/components/panel/dashboard/recent-orders-card";
import { RevenueChart } from "@/components/panel/dashboard/revenue-chart";
import { PanelPageHeading } from "@/components/panel/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminDashboard } from "@/hooks/use-admin-dashboard";
import { useAuth } from "@/lib/auth/auth-context";
import { roleLabel } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

export function DashboardView() {
  const { user } = useAuth();
  const { dashboard, isLoading, isFetching, isError, refetch } =
    useAdminDashboard();
  const firstName = user?.fullName.trim().split(/\s+/)[0];

  return (
    <>
      <PanelPageHeading
        title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        description="How the shop is trading this month."
        action={
          <div className="flex items-center gap-2">
            {user ? <Badge variant="secondary">{roleLabel(user.role)}</Badge> : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 cursor-pointer gap-2"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={cn("size-4", isFetching && "animate-spin")}
                aria-hidden
              />
              <span className="max-sm:sr-only">Refresh</span>
            </Button>
          </div>
        }
      />

      {isLoading ? <DashboardSkeleton /> : null}

      {!isLoading && isError ? (
        <Card>
          <CardContent className="flex flex-col gap-3 py-8">
            <p className="font-medium">Could not load dashboard data.</p>
            <p className="text-sm text-muted-foreground">
              Refresh the page or try again in a moment.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {dashboard ? (
        <>
          <KpiRow currency={dashboard.currency} kpis={dashboard.kpis} />

          <div className="grid min-w-0 gap-4 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <RevenueChart
                currency={dashboard.currency}
                revenueTrend={dashboard.revenueTrend}
              />
            </div>
            <OrderPipeline ordersByStatus={dashboard.ordersByStatus} />
          </div>

          <div className="grid min-w-0 gap-4 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <RecentOrdersCard
                currency={dashboard.currency}
                recentOrders={dashboard.recentOrders}
              />
            </div>
            <LowStockCard lowStock={dashboard.lowStock} />
          </div>
        </>
      ) : null}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardContent className="space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-[230px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4">
            <Skeleton className="h-5 w-36" />
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
