/**
 * A panel screen that exists but is not built yet.
 *
 * The seven sections beyond the dashboard are routed, guarded and in the menu -
 * only their contents are missing. This says so plainly rather than showing an
 * empty table that looks broken, and takes its title and description from the
 * nav entry so the page, the menu and the breadcrumb cannot disagree.
 */

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { panelNavItems } from "@/lib/panel/nav";
import { PanelPageHeading } from "./page-heading";

export function PanelPlaceholder({ href }: { href: string }) {
  const item = panelNavItems.find((entry) => entry.href === href);

  if (!item) return null;

  const Icon = item.icon;

  return (
    <>
      <PanelPageHeading title={item.label} description={item.description} />

      <Empty className="min-h-80 border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-10">
            <Icon className="size-5" aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Not built yet</EmptyTitle>
          <EmptyDescription>
            The route, the menu entry and the access rule are in place. The
            table and its forms are what comes next.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}
