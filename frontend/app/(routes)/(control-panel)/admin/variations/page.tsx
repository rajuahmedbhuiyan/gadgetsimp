import type { Metadata } from "next";

import { VariationsView } from "@/components/panel/variations/variations-view";

export const metadata: Metadata = { title: "Variations" };

export default function AdminVariationsPage() {
  return <VariationsView />;
}
