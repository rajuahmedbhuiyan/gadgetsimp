"use client";

import { useQuery } from "@tanstack/react-query";

import { authApi } from "@/lib/api/auth";
import type { AuthProviderName } from "@/lib/api/types";

/**
 * What this deployment can actually serve.
 *
 * A build may have Google configured and Facebook not, so hard-coding both
 * means shipping a button that answers 503.
 */
export function useAuthProviders() {
  const query = useQuery({
    queryKey: ["auth", "providers"],
    queryFn: async () => (await authApi.providers()).data.providers,
    staleTime: 5 * 60_000,
  });

  const providers = query.data ?? [];

  return {
    providers,
    isLoading: query.isPending,
    supports: (provider: AuthProviderName) => providers.includes(provider),
  };
}
