import type { Metadata } from "next";

import { PanelPlaceholder } from "@/components/panel/panel-placeholder";

export const metadata: Metadata = { title: "Variations" };

export default function AdminVariationsPage() {
  return <PanelPlaceholder href="/admin/variations" />;
}
