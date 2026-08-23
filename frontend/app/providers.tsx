"use client";

import { Suspense } from "react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "next-themes";
import { MotionConfig } from "motion/react";
import { NavigationProgress } from "@/components/navigation/navigation-progress";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { User } from "@/lib/api/types";
import { AuthProvider } from "@/lib/auth/auth-context";

export function Providers({
  initialUser,
  children,
}: {
  /** Resolved by middleware, so the first paint already knows the user. */
  initialUser: User | null;
  children: React.ReactNode;
}) {
  // One client per browser session, created lazily so it is never shared
  // between requests on the server.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            // The API answers 4xx for bad input and 401 for an expired
            // session, which the client already handles - retrying those
            // only burns the rate limit.
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        {/* `storageKey` is what next-themes persists the choice under. The
            API-backed preference lands later; until then localStorage is the
            whole story. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="gadgetsimp-theme"
          disableTransitionOnChange
        >
          {/* `reducedMotion="user"` drops transform and layout animations for
              anyone with the OS setting on, so no component has to check. */}
          <MotionConfig reducedMotion="user">
            <AuthProvider initialUser={initialUser}>
              <Suspense fallback={null}>
                <NavigationProgress />
              </Suspense>
              <TooltipProvider>{children}</TooltipProvider>
            </AuthProvider>
          </MotionConfig>
        </ThemeProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  );
}
