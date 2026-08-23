"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  adminBrandsApi,
  type AdminBrandQuery,
  type BrandWritePayload,
} from "@/lib/api/admin/brands";
import { apiMessage } from "@/hooks/use-admin-products";

export const BRANDS_PAGE_SIZE = 20;

export const adminBrandsKey = (query: AdminBrandQuery) =>
  ["admin", "brands", query] as const;

export function useAdminBrands(query: AdminBrandQuery) {
  const result = useQuery({
    queryKey: adminBrandsKey(query),
    queryFn: () => adminBrandsApi.list(query),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const loading = result.isPending || result.isFetching;

  return {
    brands: loading ? [] : (result.data?.brands ?? []),
    meta: loading ? null : (result.data?.meta ?? null),
    isLoading: loading,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

function invalidateBrands(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["admin", "brands"] });
  void queryClient.invalidateQueries({ queryKey: ["taxonomy"] });
}

export function useCreateBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: BrandWritePayload) => adminBrandsApi.create(body),
    onSuccess: (brand) => {
      toast.success(`${brand.name} created`);
      invalidateBrands(queryClient);
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not create the brand"));
    },
  });
}

export function useUpdateBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: BrandWritePayload }) =>
      adminBrandsApi.update(id, body),
    onSuccess: (brand) => {
      toast.success(`${brand.name} updated`);
      invalidateBrands(queryClient);
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not update the brand"));
    },
  });
}

export function useDeleteBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminBrandsApi.remove(id),
    onSuccess: () => {
      toast.success("Brand archived");
      invalidateBrands(queryClient);
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not archive the brand"));
    },
  });
}
