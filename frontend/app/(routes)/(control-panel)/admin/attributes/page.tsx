import type { Metadata } from "next";

import { AttributesView } from "@/components/panel/attributes/attributes-view";

export const metadata: Metadata = { title: "Attributes" };

export default function AdminAttributesPage() {
  return <AttributesView />;
}
