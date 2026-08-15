import type { Metadata } from "next";

import { PanelPlaceholder } from "@/components/panel/panel-placeholder";

export const metadata: Metadata = { title: "Attributes" };

export default function AdminAttributesPage() {
  return <PanelPlaceholder href="/admin/attributes" />;
}
