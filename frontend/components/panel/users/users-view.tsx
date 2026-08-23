"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseAsArrayOf, parseAsBoolean, parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { Plus, RefreshCw, UserSearch, UsersRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { userPermissions } from "@/lib/panel/permissions";
import {
  USER_ROLES,
  USER_STATUSES,
  type AdminUser,
  type AdminUserQuery,
  type CreateUserPayload,
} from "@/lib/api/admin/users";
import type { Role, UserStatus } from "@/lib/api/types";
import {
  USERS_PAGE_SIZE,
  useAdminUsers,
  useChangeUserRole,
  useChangeUserStatus,
  useCreateUser,
  useHardDeleteUser,
  useSoftDeleteUser,
} from "@/hooks/use-admin-users";
import { PanelPageHeading } from "@/components/panel/page-heading";
import { Pager } from "@/components/panel/pager";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChangeUserRoleDialog,
  ChangeUserStatusDialog,
  CreateUserDialog,
  DeleteUserDialog,
  DestroyUserDialog,
} from "./user-dialogs";
import { USER_SORTS, UserFilters, type UserFilterState } from "./user-filters";
import { UsersTable } from "./users-table";

const SEARCH_DEBOUNCE_MS = 350;

function dateBoundary(value: string, edge: "start" | "end"): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function UsersView() {
  const topRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const permissions = userPermissions(user);

  const [state, setQuery] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      role: parseAsArrayOf(parseAsString).withDefault([]),
      status: parseAsArrayOf(parseAsString).withDefault([]),
      verified: parseAsString.withDefault("any"),
      sort: parseAsString.withDefault("created-desc"),
      limit: parseAsString.withDefault(String(USERS_PAGE_SIZE)),
      from: parseAsString.withDefault(""),
      to: parseAsString.withDefault(""),
      deleted: parseAsBoolean.withDefault(false),
      page: parseAsInteger.withDefault(1),
    },
    { history: "replace", shallow: true, clearOnDefault: true },
  );

  const roles = useMemo(
    () =>
      state.role.filter((entry): entry is Role =>
        (USER_ROLES as readonly string[]).includes(entry),
      ),
    [state.role],
  );
  const statuses = useMemo(
    () =>
      state.status.filter((entry): entry is UserStatus =>
        (USER_STATUSES as readonly string[]).includes(entry),
      ),
    [state.status],
  );
  const chosen = USER_SORTS.find((option) => option.value === state.sort) ?? USER_SORTS[0];
  const pageIndex = Math.max(1, state.page) - 1;
  const limit = [20, 50, 100].includes(Number(state.limit))
    ? Number(state.limit)
    : USERS_PAGE_SIZE;

  const query: AdminUserQuery = useMemo(
    () => ({
      ...(state.q ? { search: state.q } : {}),
      ...(roles.length > 0 ? { role: roles } : {}),
      ...(statuses.length > 0 ? { status: statuses } : {}),
      ...(state.verified === "yes"
        ? { emailVerified: true }
        : state.verified === "no"
          ? { emailVerified: false }
          : {}),
      ...(dateBoundary(state.from, "start")
        ? { createdFrom: dateBoundary(state.from, "start") }
        : {}),
      ...(dateBoundary(state.to, "end")
        ? { createdTo: dateBoundary(state.to, "end") }
        : {}),
      ...(state.deleted ? { includeDeleted: true } : {}),
      sortBy: chosen.sortBy,
      sortOrder: chosen.sortOrder,
      page: pageIndex,
      limit,
    }),
    [
      chosen.sortBy,
      chosen.sortOrder,
      limit,
      pageIndex,
      roles,
      state.deleted,
      state.from,
      state.q,
      state.to,
      state.verified,
      statuses,
    ],
  );

  const queryMarker = useMemo(() => JSON.stringify(query), [query]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [queryMarker]);

  const { users, meta, isLoading, isFetching, isError, refetch } = useAdminUsers(query);
  const [searchInput, setSearchInput] = useState(state.q);

  useEffect(() => {
    if (searchInput === state.q) return;
    const timer = setTimeout(() => {
      void setQuery({ q: searchInput || null, page: null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, state.q, setQuery]);

  const create = useCreateUser();
  const changeRole = useChangeUserRole();
  const changeStatus = useChangeUserStatus();
  const softDelete = useSoftDeleteUser();
  const hardDelete = useHardDeleteUser();

  const [createOpen, setCreateOpen] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<{
    user: AdminUser;
    role: Role;
  } | null>(null);
  const [pendingStatus, setPendingStatus] = useState<{
    user: AdminUser;
    status: Extract<UserStatus, "ACTIVE" | "SUSPENDED">;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const [pendingDestroy, setPendingDestroy] = useState<AdminUser | null>(null);

  const filters: UserFilterState = {
    search: searchInput,
    role: roles,
    status: statuses,
    verified:
      state.verified === "yes" || state.verified === "no"
        ? state.verified
        : "any",
    sort: chosen.value,
    limit: String(limit),
    createdFrom: state.from,
    createdTo: state.to,
    includeDeleted: state.deleted,
  };

  const applyFilters = (patch: Partial<UserFilterState>) => {
    if (patch.search !== undefined) setSearchInput(patch.search);

    void setQuery({
      ...(patch.role !== undefined ? { role: patch.role.length ? patch.role : null } : {}),
      ...(patch.status !== undefined ? { status: patch.status.length ? patch.status : null } : {}),
      ...(patch.verified !== undefined ? { verified: patch.verified === "any" ? null : patch.verified } : {}),
      ...(patch.sort !== undefined ? { sort: patch.sort } : {}),
      ...(patch.limit !== undefined ? { limit: patch.limit === String(USERS_PAGE_SIZE) ? null : patch.limit } : {}),
      ...(patch.createdFrom !== undefined ? { from: patch.createdFrom || null } : {}),
      ...(patch.createdTo !== undefined ? { to: patch.createdTo || null } : {}),
      ...(patch.includeDeleted !== undefined ? { deleted: patch.includeDeleted || null } : {}),
      page: null,
    });
  };

  const clearFilters = () => {
    setSearchInput("");
    void setQuery({
      q: null,
      role: null,
      status: null,
      verified: null,
      sort: null,
      limit: null,
      from: null,
      to: null,
      deleted: null,
      page: null,
    });
  };

  const filtered =
    Boolean(state.q) ||
    roles.length > 0 ||
    statuses.length > 0 ||
    state.verified !== "any" ||
    Boolean(state.from || state.to) ||
    state.deleted;

  return (
    <>
      <div
        ref={topRef}
        className="flex scroll-mt-24 flex-col gap-4 lg:h-[calc(100svh-var(--h-header)-3rem)] lg:min-h-0"
      >
        <div className="sticky top-header z-20 -mx-4 -mt-4 flex flex-col gap-3 border-b bg-background/95 px-4 pt-4 pb-3 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-lg sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
          <PanelPageHeading
            title="Users"
            description="Accounts, access level and account state."
            action={
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  className="h-10 cursor-pointer gap-2 rounded-lg text-sm"
                >
                  <RefreshCw className={cn("size-4", isFetching && "animate-spin")} aria-hidden />
                  <span className="max-sm:sr-only">Refresh</span>
                </Button>
                {permissions.create ? (
                  <Button
                    onClick={() => {
                      setGeneratedPassword(null);
                      setCreateOpen(true);
                    }}
                    className="h-10 cursor-pointer gap-2 rounded-lg text-sm font-semibold"
                  >
                    <Plus className="size-4" aria-hidden />
                    <span className="max-sm:sr-only">New user</span>
                  </Button>
                ) : null}
              </div>
            }
          />

          <UserFilters
            value={filters}
            onChange={applyFilters}
            onClear={clearFilters}
            resultCount={meta?.total ?? null}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {isError ? (
            <Failed onRetry={() => void refetch()} />
          ) : isLoading ? (
            <TableSkeleton />
          ) : users.length === 0 ? (
            <Empty filtered={filtered} onClear={clearFilters} />
          ) : (
            <>
              <UsersTable
                users={users}
                actorId={user?.id}
                actorRole={user?.role}
                permissions={permissions}
                busy={isFetching}
                onChangeRole={(target, role) => setPendingRole({ user: target, role })}
                onChangeStatus={(target, status) =>
                  setPendingStatus({ user: target, status })
                }
                onDelete={setPendingDelete}
                onDestroy={setPendingDestroy}
              />

              <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t bg-background/95 px-4 py-3 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-lg sm:-mx-6 sm:-mb-6 sm:px-6">
                {meta ? (
                  <Pager
                    meta={meta}
                    shown={users.length}
                    noun="users"
                    onPageChange={(next) => void setQuery({ page: next + 1 })}
                  />
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      <CreateUserDialog
        open={createOpen}
        actorRole={user?.role}
        saving={create.isPending}
        generatedPassword={generatedPassword}
        onOpenChange={setCreateOpen}
        onCreate={(payload: CreateUserPayload) =>
          create.mutate(payload, {
            onSuccess: (result) => {
              setGeneratedPassword(result.generatedPassword ?? null);
              if (!result.generatedPassword) setCreateOpen(false);
            },
          })
        }
      />

      <DeleteUserDialog
        user={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={(target) => {
          softDelete.mutate(target.id);
          setPendingDelete(null);
        }}
      />

      <ChangeUserRoleDialog
        pending={pendingRole}
        saving={changeRole.isPending}
        onClose={() => setPendingRole(null)}
        onConfirm={({ user: target, role }) => {
          changeRole.mutate({ id: target.id, role });
          setPendingRole(null);
        }}
      />

      <ChangeUserStatusDialog
        pending={pendingStatus}
        saving={changeStatus.isPending}
        onClose={() => setPendingStatus(null)}
        onConfirm={({ user: target, status }) => {
          changeStatus.mutate({ id: target.id, status });
          setPendingStatus(null);
        }}
      />

      <DestroyUserDialog
        user={pendingDestroy}
        onClose={() => setPendingDestroy(null)}
        onConfirm={(target) => {
          hardDelete.mutate(target.id);
          setPendingDestroy(null);
        }}
      />
    </>
  );
}

function Empty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {filtered ? <UserSearch className="size-7" aria-hidden /> : <UsersRound className="size-7" aria-hidden />}
      </span>
      <h2 className="font-heading text-lg font-bold tracking-tight">
        {filtered ? "Nothing matches those filters" : "No users yet"}
      </h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {filtered
          ? "Try a different search, or clear the filters and start again."
          : "Created accounts will appear here."}
      </p>
      {filtered ? (
        <Button
          variant="outline"
          onClick={onClear}
          className="mt-6 h-10 cursor-pointer rounded-lg px-5 text-sm font-semibold"
        >
          Reset filters
        </Button>
      ) : null}
    </div>
  );
}

function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <h2 className="font-heading text-lg font-bold tracking-tight">
        Could not load users
      </h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        The user list did not answer. This is usually a connection problem.
      </p>
      <Button
        variant="outline"
        onClick={onRetry}
        className="mt-6 h-10 cursor-pointer gap-2 rounded-lg px-5 text-sm font-semibold"
      >
        <RefreshCw className="size-4" aria-hidden />
        Try again
      </Button>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border p-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
          <Skeleton className="hidden h-6 w-24 rounded-full lg:block" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
