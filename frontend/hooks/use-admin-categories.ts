"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  adminCategoriesApi,
  type CategorySortEntry,
  type CategoryWritePayload,
} from "@/lib/api/admin/categories";
import { apiMessage } from "@/hooks/use-admin-products";

export const adminCategoriesKey = (query: { search?: string }) =>
  ["admin", "categories", "tree", query] as const;

export function useAdminCategoryTree(query: { search?: string }) {
  const result = useQuery({
    queryKey: adminCategoriesKey(query),
    queryFn: () => adminCategoriesApi.tree(query),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const loading = result.isPending || result.isFetching;

  return {
    tree: loading ? [] : (result.data ?? []),
    isLoading: loading,
    isFetching: result.isFetching,
    isError: result.isError,
    refetch: result.refetch,
  };
}

function invalidateCategories(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
  void queryClient.invalidateQueries({ queryKey: ["admin", "category-tree"] });
  void queryClient.invalidateQueries({ queryKey: ["taxonomy"] });
  void queryClient.invalidateQueries({ queryKey: ["shop", "categories"] });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CategoryWritePayload) => adminCategoriesApi.create(body),
    onSuccess: (category) => {
      toast.success(`${category.name} created`);
      invalidateCategories(queryClient);
    },
    onError: (error) => toast.error(apiMessage(error, "Could not create the category")),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CategoryWritePayload }) =>
      adminCategoriesApi.update(id, body),
    onSuccess: (category) => {
      toast.success(`${category.name} updated`);
      invalidateCategories(queryClient);
    },
    onError: (error) => toast.error(apiMessage(error, "Could not update the category")),
  });
}

export function useSortCategories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (categories: CategorySortEntry[]) => adminCategoriesApi.sort(categories),
    onSuccess: () => {
      toast.success("Category order updated");
      invalidateCategories(queryClient);
    },
    onError: (error) => toast.error(apiMessage(error, "Could not update category order")),
  });
}

export function useSetCategoryHomeVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, showInHome }: { ids: string[]; showInHome: boolean }) =>
      adminCategoriesApi.setShowInHome(ids, showInHome),
    onSuccess: () => {
      toast.success("Home visibility updated");
      invalidateCategories(queryClient);
    },
    onError: (error) => toast.error(apiMessage(error, "Could not update home visibility")),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminCategoriesApi.remove(id),
    onSuccess: () => {
      toast.success("Category archived");
      invalidateCategories(queryClient);
    },
    onError: (error) => toast.error(apiMessage(error, "Could not archive the category")),
  });
}
