import type { Metadata } from "next";
import { headers } from "next/headers";

import { KpiRow } from "@/components/panel/dashboard/kpi-row";
import { LowStockCard } from "@/components/panel/dashboard/low-stock-card";
import { OrderPipeline } from "@/components/panel/dashboard/order-pipeline";
import { RecentOrdersCard } from "@/components/panel/dashboard/recent-orders-card";
import { RevenueChart } from "@/components/panel/dashboard/revenue-chart";
import { PanelPageHeading } from "@/components/panel/page-heading";
import { Badge } from "@/components/ui/badge";
import { roleLabel } from "@/lib/auth/roles";
import { decodeUserHeader, USER_HEADER } from "@/lib/auth/user-header";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Trade at a glance for GadgetSimp staff.",
};

/**
 * The panel's front page.
 *
 * Design only: every figure on this screen comes from `lib/panel/demo-data`
 * and nothing here calls the API. The layout is the deliverable - four
 * headline numbers, the trend, the queue, and the two lists a shop actually
 * opens a dashboard to check - so that wiring each card to its endpoint later
 * is a change of source rather than a redesign.
 *
 * A server component: the only thing that needs the client is the chart's
 * hover, which lives in its own component.
 */
export default async function DashboardPage() {
  // Resolved by middleware; the layout above already refused anyone who is not
  // staff, so this is only here to say hello by name.
  const user = decodeUserHeader((await headers()).get(USER_HEADER));
  const firstName = user?.fullName.trim().split(/\s+/)[0];

  return (
    <>
      <PanelPageHeading
        title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        description="How the shop is trading. Figures are placeholder data until the API is wired up."
        action={
          user ? <Badge variant="secondary">{roleLabel(user.role)}</Badge> : null
        }
      />

      <KpiRow />

      {/* The trend gets two thirds; the queue is a list and reads fine narrow. */}
      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <RevenueChart />
        </div>
        <OrderPipeline />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <RecentOrdersCard />
        </div>
        <LowStockCard />
      </div>
    </>
  );
}
