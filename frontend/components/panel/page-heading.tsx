import type { ReactNode } from "react";

/**
 * The title block every panel page opens with.
 *
 * The breadcrumb in the header already says where you are; this says what the
 * page is for, and holds the one or two actions that belong to the page rather
 * than to a card inside it.
 */
export function PanelPageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}
