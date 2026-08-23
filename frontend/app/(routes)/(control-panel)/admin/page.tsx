import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardView } from "@/components/panel/dashboard/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Trade at a glance for GadgetSimp staff.",
};

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardView />
    </Suspense>
  );
}
