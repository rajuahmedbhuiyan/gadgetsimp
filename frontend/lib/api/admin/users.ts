import { api } from "@/lib/api/client";
import type { PaginationMeta, Role, User, UserStatus } from "@/lib/api/types";

export const USER_ROLES = [
  "ROLE_CUSTOMER",
  "ROLE_MODERATOR",
  "ROLE_ADMIN",
  "ROLE_OWNER",
] as const satisfies readonly Role[];

export const USER_STATUSES = [
  "ACTIVE",
  "SUSPENDED",
  "DELETED",
] as const satisfies readonly UserStatus[];

export const USER_WRITABLE_STATUSES = [
  "ACTIVE",
  "SUSPENDED",
] as const satisfies readonly Extract<UserStatus, "ACTIVE" | "SUSPENDED">[];

export interface AdminUser extends User {
  deletedAt?: string | null;
}

export type UserSortBy =
  | "createdAt"
  | "lastLoginAt"
  | "fullName"
  | "email"
  | "role"
  | "status";

export interface AdminUserQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: Role | Role[];
  status?: UserStatus | UserStatus[];
  emailVerified?: boolean;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: UserSortBy;
  sortOrder?: "asc" | "desc";
  includeDeleted?: boolean;
}

export interface AdminUserPage {
  users: AdminUser[];
  meta: PaginationMeta | null;
}

export interface CreateUserPayload {
  fullName: string;
  email: string;
  password?: string;
  role?: Role;
  phone?: string;
  image?: string;
  sendEmail?: boolean;
}

export interface CreateUserResult {
  user: AdminUser;
  generatedPassword?: string;
}

export interface HardDeleteUserResult {
  id: number;
  email: string;
}

export const adminUsersApi = {
  async list(query: AdminUserQuery): Promise<AdminUserPage> {
    const payload = await api<{ users: AdminUser[] }>("/users/filter", {
      method: "POST",
      body: query,
    });

    return { users: payload.data.users, meta: payload.meta ?? null };
  },

  async create(body: CreateUserPayload): Promise<CreateUserResult> {
    const payload = await api<CreateUserResult>("/users/create", {
      method: "POST",
      body,
    });
    return payload.data;
  },

  async changeRole(id: number, role: Role): Promise<AdminUser> {
    const payload = await api<{ user: AdminUser }>(`/users/${id}/role`, {
      method: "PATCH",
      body: { role },
    });
    return payload.data.user;
  },

  async changeStatus(
    id: number,
    status: Extract<UserStatus, "ACTIVE" | "SUSPENDED">,
  ): Promise<AdminUser> {
    const payload = await api<{ user: AdminUser }>(`/users/${id}/status`, {
      method: "PATCH",
      body: { status },
    });
    return payload.data.user;
  },

  async softDelete(id: number): Promise<AdminUser> {
    const payload = await api<{ user: AdminUser }>(`/users/${id}`, {
      method: "DELETE",
    });
    return payload.data.user;
  },

  async hardDelete(id: number): Promise<HardDeleteUserResult> {
    const payload = await api<{ deleted: HardDeleteUserResult }>(
      `/users/${id}/permanent`,
      { method: "DELETE" },
    );
    return payload.data.deleted;
  },
};
