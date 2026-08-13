/**
 * The envelope's top-level `message`, shown above the form. Field-level
 * `errors[]` go on their own controls instead.
 *
 * `role="alert"` on the error variant so a screen reader announces a failed
 * submit - the visual jump to the top of the form is no use to someone who
 * cannot see it. The informational variants stay silent; they are usually
 * present on first paint and would be read before the heading.
 */

import type { ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export type AlertTone = "error" | "info" | "success";

const TONES: Record<
  AlertTone,
  { icon: typeof Info; wrapper: string; iconColor: string }
> = {
  error: {
    icon: TriangleAlert,
    wrapper: "border-destructive/30 bg-destructive/8 text-foreground",
    iconColor: "text-destructive",
  },
  info: {
    icon: Info,
    wrapper: "border-brand/35 bg-brand/10 text-foreground",
    iconColor: "text-brand-foreground dark:text-brand",
  },
  success: {
    icon: CheckCircle2,
    wrapper: "border-success/35 bg-success/10 text-foreground",
    iconColor: "text-success",
  },
};

export function FormAlert({
  message,
  tone = "error",
  className,
  children,
}: {
  message: string;
  tone?: AlertTone;
  className?: string;
  children?: ReactNode;
}) {
  const { icon: Icon, wrapper, iconColor } = TONES[tone];

  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "mb-5 flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm",
        wrapper,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-4.5 shrink-0", iconColor)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{message}</p>
        {children ? (
          <div className="mt-1 text-muted-foreground">{children}</div>
        ) : null}
      </div>
    </div>
  );
}
