/**
 * A menu entry that may point off-site.
 *
 * The nav data is shared by the desktop menu, the mobile drawer and the
 * footer, and any of those entries can be external - the support links all go
 * to WhatsApp. Rather than each surface repeating the same ternary, they
 * render this: a `<Link>` for internal routes (client-side navigation and
 * prefetch) and a plain anchor with `target="_blank"` for external ones,
 * where a `<Link>` would buy nothing and Next would still have to fall back to
 * a full page load.
 *
 * `rel="noopener noreferrer"` so the destination gets neither a handle on our
 * window nor the page the shopper came from.
 */

import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";

type NavLinkProps = {
  href: string;
  external?: boolean;
  children: ReactNode;
} & Omit<ComponentProps<"a">, "href" | "children">;

export function NavLink({
  href,
  external,
  children,
  ...props
}: NavLinkProps) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}
