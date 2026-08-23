"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseAsString, useQueryStates } from "nuqs";
import { FolderTree, Plus, RefreshCw, SearchX } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { categoryPermissions } from "@/lib/panel/permissions";
import type {
  AdminCategory,
  CategorySortEntry,
  CategoryWritePayload,
} from "@/lib/api/admin/categories";
import { useAdminAttributes } from "@/hooks/use-admin-attributes";
import {
  useAdminCategoryTree,
  useCreateCategory,
  useDeleteCategory,
  useSetCategoryHomeVisibility,
  useSortCategories,
  useUpdateCategory,
} from "@/hooks/use-admin-categories";
import { PanelPageHeading } from "@/components/panel/page-heading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryFilters } from "./category-filters";
import {
  CategoryFormDialog,
  DeleteCategoryDialog,
  HomeVisibilityDialog,
} from "./category-dialogs";
import { CategoryTree } from "./category-tree";

const SEARCH_DEBOUNCE_MS = 350;

export function CategoriesView() {
  const topRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const permissions = categoryPermissions(user);
  const [state, setQuery] = useQueryStates(
    { q: parseAsString.withDefault("") },
    { history: "replace", shallow: true, clearOnDefault: true },
  );
  const query = useMemo(() => (state.q ? { search: state.q } : {}), [state.q]);
  const queryMarker = useMemo(() => JSON.stringify(query), [query]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [queryMarker]);

  const { tree, isLoading, isFetching, isError, refetch } =
    useAdminCategoryTree(query);
  const { attributes, isLoading: attributesLoading } = useAdminAttributes({
    status: "ACTIVE",
    limit: 100,
  });
  const [searchInput, setSearchInput] = useState(state.q);
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminCategory | null>(null);
  const [pendingHome, setPendingHome] = useState<AdminCategory | null>(null);

  const create = useCreateCategory();
  const update = useUpdateCategory();
  const sort = useSortCategories();
  const home = useSetCategoryHomeVisibility();
  const remove = useDeleteCategory();

  useEffect(() => {
    if (searchInput === state.q) return;
    const timer = setTimeout(() => {
      void setQuery({ q: searchInput || null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, setQuery, state.q]);

  const clearFilters = () => {
    setSearchInput("");
    void setQuery({ q: null });
  };

  const saveCategory = (body: CategoryWritePayload) => {
    if (editing) {
      update.mutate(
        { id: editing.id, body },
        {
          onSuccess: () => {
            setFormOpen(false);
            setEditing(null);
          },
        },
      );
      return;
    }

    create.mutate(body, {
      onSuccess: () => setFormOpen(false),
    });
  };

  const onSort = (updates: CategorySortEntry[]) => {
    sort.mutate(updates);
  };

  return (
    <>
      <div
        ref={topRef}
        className="flex min-w-0 scroll-mt-24 flex-col gap-4 lg:h-[calc(100svh-var(--h-header)-3rem)] lg:min-h-0"
      >
        <div className="sticky top-header z-20 -mt-4 flex min-w-0 flex-col gap-3 border-b bg-background/95 pt-4 pb-3 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-lg sm:-mt-6 sm:pt-6">
          <PanelPageHeading
            title="Categories"
            description="Nested storefront taxonomy, ordering and filter configuration."
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
                      setEditing(null);
                      setFormOpen(true);
                    }}
                    className="h-10 cursor-pointer gap-2 rounded-lg text-sm font-semibold"
                  >
                    <Plus className="size-4" aria-hidden />
                    <span className="max-sm:sr-only">New category</span>
                  </Button>
                ) : null}
              </div>
            }
          />

          <CategoryFilters
            search={searchInput}
            onSearchChange={setSearchInput}
            onClear={clearFilters}
          />
        </div>

        <div className="flex min-w-0 min-h-0 flex-1 flex-col gap-4 lg:overflow-y-auto lg:pr-1 lg:[scrollbar-gutter:stable]">
          {isError ? (
            <Failed onRetry={() => void refetch()} />
          ) : isLoading ? (
            <TreeSkeleton />
          ) : tree.length === 0 ? (
            <Empty filtered={Boolean(state.q)} onClear={clearFilters} />
          ) : (
            <CategoryTree
              tree={tree}
              permissions={permissions}
              busy={isFetching || sort.isPending || home.isPending}
              onEdit={(category) => {
                setEditing(category);
                setFormOpen(true);
              }}
              onArchive={setPendingDelete}
              onToggleHome={setPendingHome}
              onSort={onSort}
            />
          )}
        </div>
      </div>

      <CategoryFormDialog
        open={formOpen}
        category={editing}
        tree={tree}
        attributes={attributes}
        saving={create.isPending || update.isPending || attributesLoading}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        onSave={saveCategory}
      />

      <DeleteCategoryDialog
        category={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={(category) => {
          remove.mutate(category.id);
          setPendingDelete(null);
        }}
      />

      <HomeVisibilityDialog
        category={pendingHome}
        onClose={() => setPendingHome(null)}
        onConfirm={(category) => {
          home.mutate({ ids: [category.id], showInHome: !(category.showInHome ?? false) });
          setPendingHome(null);
        }}
      />
    </>
  );
}

function Empty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {filtered ? <SearchX className="size-7" aria-hidden /> : <FolderTree className="size-7" aria-hidden />}
      </span>
      <h2 className="font-heading text-lg font-bold tracking-tight">
        {filtered ? "Nothing matches that search" : "No public categories"}
      </h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {filtered
          ? "Try a different category name or clear the search."
          : "Active, public categories will appear here in their nested order."}
      </p>
      {filtered ? (
        <Button variant="outline" onClick={onClear} className="mt-6 h-10 cursor-pointer rounded-lg px-5 text-sm font-semibold">
          Reset search
        </Button>
      ) : null}
    </div>
  );
}

function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <h2 className="font-heading text-lg font-bold tracking-tight">
        Could not load categories
      </h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        The category tree did not answer. This is usually a connection problem.
      </p>
      <Button variant="outline" onClick={onRetry} className="mt-6 h-10 cursor-pointer gap-2 rounded-lg px-5 text-sm font-semibold">
        <RefreshCw className="size-4" aria-hidden />
        Try again
      </Button>
    </div>
  );
}

function TreeSkeleton() {
  return (
    <div className="grid gap-2 rounded-xl border bg-card p-2">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-lg border bg-background p-3">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="size-12 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}
