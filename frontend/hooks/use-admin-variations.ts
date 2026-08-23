"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  adminVariationsApi,
  type AdminVariationQuery,
  type VariationPatchPayload,
} from "@/lib/api/admin/variations";
import { apiMessage } from "@/hooks/use-admin-products";

export const VARIATIONS_PAGE_SIZE = 20;

export const adminVariationsKey = (query: AdminVariationQuery) =>
  ["admin", "variations", query] as const;

export function useAdminVariations(query: AdminVariationQuery) {
  const result = useQuery({
    queryKey: adminVariationsKey(query),
    queryFn: () => adminVariationsApi.list(query),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const loading = result.isPending || result.isFetching;

  return {
    variations: loading ? [] : (result.data?.variations ?? []),
    meta: loading ? null : (result.data?.meta ?? null),
    isLoading: loading,
    isFetching: result.isFetching,
    isError: result.isError,
    refetch: result.refetch,
  };
}

function invalidateVariations(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["admin", "variations"] });
  void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
}

export function useUpdateVariation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: VariationPatchPayload }) =>
      adminVariationsApi.update(id, body),
    onSuccess: (variation) => {
      toast.success(`${variation.sku} updated`);
      invalidateVariations(queryClient);
    },
    onError: (error) => toast.error(apiMessage(error, "Could not update the variation")),
  });
}

export function useDeleteVariation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminVariationsApi.remove(id),
    onSuccess: () => {
      toast.success("Variation deleted");
      invalidateVariations(queryClient);
    },
    onError: (error) => toast.error(apiMessage(error, "Could not delete the variation")),
  });
}
