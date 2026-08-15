import type { Metadata } from "next";

import { PanelPlaceholder } from "@/components/panel/panel-placeholder";

export const metadata: Metadata = { title: "Users" };

export default function AdminUsersPage() {
  return <PanelPlaceholder href="/admin/users" />;
}
