"use client";

/**
 * Hides a piece of storefront chrome on the routes that do without it.
 *
 * A thin client wrapper so the things it gates - the top bar, the WhatsApp
 * button - stay server components and keep arriving in the HTML on every
 * other page.
 */

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { hasBareChrome } from "@/lib/layout/chrome";

export function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (hasBareChrome(pathname)) return null;
  return <>{children}</>;
}
