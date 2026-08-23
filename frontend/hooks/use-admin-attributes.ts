"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  adminAttributesApi,
  type AdminAttributeQuery,
  type AttributeWritePayload,
} from "@/lib/api/admin/attributes";
import { apiMessage } from "@/hooks/use-admin-products";

export const ATTRIBUTES_PAGE_SIZE = 20;

export const adminAttributesKey = (query: AdminAttributeQuery) =>
  ["admin", "attributes", query] as const;

export function useAdminAttributes(query: AdminAttributeQuery) {
  const result = useQuery({
    queryKey: adminAttributesKey(query),
    queryFn: () => adminAttributesApi.list(query),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const loading = result.isPending || result.isFetching;

  return {
    attributes: loading ? [] : (result.data?.attributes ?? []),
    meta: loading ? null : (result.data?.meta ?? null),
    isLoading: loading,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

function invalidateAttributes(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["admin", "attributes"] });
  void queryClient.invalidateQueries({ queryKey: ["taxonomy"] });
}

export function useCreateAttribute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: AttributeWritePayload) => adminAttributesApi.create(body),
    onSuccess: (attribute) => {
      toast.success(`${attribute.name} created`);
      invalidateAttributes(queryClient);
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not create the attribute"));
    },
  });
}

export function useUpdateAttribute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AttributeWritePayload }) =>
      adminAttributesApi.update(id, body),
    onSuccess: (attribute) => {
      toast.success(`${attribute.name} updated`);
      invalidateAttributes(queryClient);
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not update the attribute"));
    },
  });
}

export function useDeleteAttribute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminAttributesApi.remove(id),
    onSuccess: () => {
      toast.success("Attribute archived");
      invalidateAttributes(queryClient);
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not archive the attribute"));
    },
  });
}
