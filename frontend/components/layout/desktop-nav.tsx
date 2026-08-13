"use client";

/**
 * The primary menu at 1024px and up.
 *
 * Items with children open a panel on hover *and* on keyboard focus — hover
 * alone would strand anyone tabbing through. A short close delay keeps the
 * panel from vanishing while the pointer crosses the gap between the trigger
 * and the panel, which is the usual reason these feel twitchy.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { mainNav } from "@/lib/config/site";
import { transitions } from "@/lib/motion";
import { NavLink } from "./nav-link";

const CLOSE_DELAY_MS = 120;

export function DesktopNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenLabel(null), CLOSE_DELAY_MS);
  }, [cancelClose]);

  const open = useCallback(
    (label: string) => {
      cancelClose();
      setOpenLabel(label);
    },
    [cancelClose],
  );

  // A navigation with the pointer still resting on a trigger would otherwise
  // leave the panel hanging over the new page. Comparing during render closes
  // it in the same pass as the navigation - an effect would paint the stale
  // panel once first. Any close timer still pending is harmless: it sets the
  // same `null` this just set.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpenLabel(null);
  }

  useEffect(() => () => cancelClose(), [cancelClose]);

  useEffect(() => {
    if (!openLabel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenLabel(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openLabel]);

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname.startsWith(href.split("?")[0]!);

  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex items-center gap-1">
        {mainNav.map((item) => {
          const active = isActive(item.href);
          const expanded = openLabel === item.label;

          return (
            <li
              key={item.label}
              className="relative"
              onMouseEnter={() => item.children && open(item.label)}
              onMouseLeave={scheduleClose}
              onFocus={() => item.children && open(item.label)}
              onBlur={(event) => {
                // Only close once focus has actually left the item and its panel.
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  scheduleClose();
                }
              }}
            >
              <NavLink
                href={item.href}
                external={item.external}
                aria-haspopup={item.children ? "true" : undefined}
                aria-expanded={item.children ? expanded : undefined}
                className={cn(
                  "relative flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active || expanded
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                {item.children && (
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform duration-200",
                      expanded && "rotate-180",
                    )}
                    aria-hidden
                  />
                )}
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand"
                    transition={transitions.spring}
                  />
                )}
              </NavLink>

              <AnimatePresence>
                {item.children && expanded && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={transitions.fast}
                    // Sits under the header's own z-index but above the page.
                    className="absolute top-full left-0 z-50 pt-3"
                  >
                    <ul className="w-72 overflow-hidden rounded-xl border bg-popover p-2 shadow-card-hover">
                      {item.children.map((child) => (
                        <li key={child.href}>
                          <NavLink
                            href={child.href}
                            external={child.external}
                            className="group/item block rounded-lg px-3 py-2 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                          >
                            <span className="block text-sm font-medium text-foreground group-hover/item:text-brand">
                              {child.label}
                            </span>
                            {child.description && (
                              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                                {child.description}
                              </span>
                            )}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
