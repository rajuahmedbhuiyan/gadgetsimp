/**
 * The social icon buttons.
 *
 * Server component — these are static links with no state. Each keeps its
 * platform's own colour on hover, which is the one place the brand palette
 * gives way: a shopper recognises the Instagram pink faster than they read the
 * label. Labels stay in the DOM for screen readers.
 */

import { cn } from "@/lib/utils";
import { socialLinks } from "@/lib/config/site";

export function SocialLinks({
  className,
  size = "sm",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <ul className={cn("flex items-center gap-1", className)}>
      {socialLinks.map(({ label, href, icon: Icon, hoverClass }) => (
        <li key={label}>
          <a
            href={href}
            target="_blank"
            // `noreferrer` alongside `noopener` so the destination never learns
            // which page the shopper came from.
            rel="noopener noreferrer"
            title={label}
            className={cn(
              "flex cursor-pointer items-center justify-center rounded-full border border-current/25 text-current/85 transition-all duration-200 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current active:scale-95",
              size === "sm" ? "size-8" : "size-10",
              hoverClass,
            )}
          >
            <Icon
              className={size === "sm" ? "size-4" : "size-5"}
              aria-hidden
            />
            <span className="sr-only">{label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
