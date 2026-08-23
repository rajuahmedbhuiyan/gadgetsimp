"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  adminUsersApi,
  type AdminUserQuery,
  type CreateUserPayload,
} from "@/lib/api/admin/users";
import type { Role, UserStatus } from "@/lib/api/types";
import { apiMessage } from "@/hooks/use-admin-products";

export const USERS_PAGE_SIZE = 20;

export const adminUsersKey = (query: AdminUserQuery) =>
  ["admin", "users", query] as const;

export function useAdminUsers(query: AdminUserQuery) {
  const result = useQuery({
    queryKey: adminUsersKey(query),
    queryFn: () => adminUsersApi.list(query),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const loading = result.isPending || result.isFetching;

  return {
    users: loading ? [] : (result.data?.users ?? []),
    meta: loading ? null : (result.data?.meta ?? null),
    isLoading: loading,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

function invalidateUsers(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateUserPayload) => adminUsersApi.create(body),
    onSuccess: ({ user, generatedPassword }) => {
      toast.success(
        generatedPassword
          ? `${user.fullName} created. Generated password shown once.`
          : `${user.fullName} created`,
      );
      invalidateUsers(queryClient);
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not create the user"));
    },
  });
}

export function useChangeUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, role }: { id: number; role: Role }) =>
      adminUsersApi.changeRole(id, role),
    onSuccess: (user) => {
      toast.success(`${user.fullName} is now ${user.role.replace("ROLE_", "")}`);
      invalidateUsers(queryClient);
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not change the role"));
    },
  });
}

export function useChangeUserStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: number;
      status: Extract<UserStatus, "ACTIVE" | "SUSPENDED">;
    }) => adminUsersApi.changeStatus(id, status),
    onSuccess: (user) => {
      toast.success(`${user.fullName} marked ${user.status.toLowerCase()}`);
      invalidateUsers(queryClient);
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not change the account status"));
    },
  });
}

export function useSoftDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => adminUsersApi.softDelete(id),
    onSuccess: (user) => {
      toast.success(`${user.fullName} deleted`);
      invalidateUsers(queryClient);
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not delete the user"));
    },
  });
}

export function useHardDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => adminUsersApi.hardDelete(id),
    onSuccess: (deleted) => {
      toast.success(`${deleted.email} permanently deleted`);
      invalidateUsers(queryClient);
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not permanently delete the user"));
    },
  });
}
