"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { Plus, RefreshCw, Tag, Tags } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { brandPermissions } from "@/lib/panel/permissions";
import type { AdminBrand, AdminBrandQuery, BrandWritePayload } from "@/lib/api/admin/brands";
import {
  BRANDS_PAGE_SIZE,
  useAdminBrands,
  useCreateBrand,
  useDeleteBrand,
  useUpdateBrand,
} from "@/hooks/use-admin-brands";
import { PanelPageHeading } from "@/components/panel/page-heading";
import { Pager } from "@/components/panel/pager";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandFilters } from "./brand-filters";
import { BrandFormDialog, DeleteBrandDialog } from "./brand-dialogs";
import { BrandsTable } from "./brands-table";

const SEARCH_DEBOUNCE_MS = 350;

export function BrandsView() {
  const topRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const permissions = brandPermissions(user);
  const [state, setQuery] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
    },
    { history: "replace", shallow: true, clearOnDefault: true },
  );

  const pageIndex = Math.max(1, state.page) - 1;
  const query: AdminBrandQuery = useMemo(
    () => ({
      ...(state.q ? { search: state.q } : {}),
      pagination: { page: pageIndex, limit: BRANDS_PAGE_SIZE },
    }),
    [pageIndex, state.q],
  );
  const queryMarker = useMemo(() => JSON.stringify(query), [query]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [queryMarker]);

  const { brands, meta, isLoading, isFetching, isError, refetch } =
    useAdminBrands(query);
  const [searchInput, setSearchInput] = useState(state.q);
  const [editing, setEditing] = useState<AdminBrand | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminBrand | null>(null);

  const create = useCreateBrand();
  const update = useUpdateBrand();
  const remove = useDeleteBrand();

  useEffect(() => {
    if (searchInput === state.q) return;
    const timer = setTimeout(() => {
      void setQuery({ q: searchInput || null, page: null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, state.q, setQuery]);

  const clearFilters = () => {
    setSearchInput("");
    void setQuery({ q: null, page: null });
  };

  const saveBrand = (body: BrandWritePayload) => {
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

  return (
    <>
      <div
        ref={topRef}
        className="flex scroll-mt-24 flex-col gap-4 lg:h-[calc(100svh-var(--h-header)-3rem)] lg:min-h-0"
      >
        <div className="sticky top-header z-20 -mx-4 -mt-4 flex flex-col gap-3 border-b bg-background/95 px-4 pt-4 pb-3 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-lg sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
          <PanelPageHeading
            title="Brands"
            description="Global product brands shown in the storefront."
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
                    <span className="max-sm:sr-only">New brand</span>
                  </Button>
                ) : null}
              </div>
            }
          />

          <BrandFilters
            search={searchInput}
            onSearchChange={setSearchInput}
            onClear={clearFilters}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
           

          {isError ? (
            <Failed onRetry={() => void refetch()} />
          ) : isLoading ? (
            <TableSkeleton />
          ) : brands.length === 0 ? (
            <Empty filtered={Boolean(state.q)} onClear={clearFilters} />
          ) : (
            <>
              <BrandsTable
                brands={brands}
                permissions={permissions}
                busy={isFetching}
                onEdit={(brand) => {
                  setEditing(brand);
                  setFormOpen(true);
                }}
                onDelete={setPendingDelete}
              />

              <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t bg-background/95 px-4 py-3 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-lg sm:-mx-6 sm:-mb-6 sm:px-6">
                {meta ? (
                  <Pager
                    meta={meta}
                    shown={brands.length}
                    noun="brands"
                    onPageChange={(next) => void setQuery({ page: next + 1 })}
                  />
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      <BrandFormDialog
        open={formOpen}
        brand={editing}
        saving={create.isPending || update.isPending}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        onSave={saveBrand}
      />

      <DeleteBrandDialog
        brand={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={(brand) => {
          remove.mutate(brand.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}

function Empty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {filtered ? <Tag className="size-7" aria-hidden /> : <Tags className="size-7" aria-hidden />}
      </span>
      <h2 className="font-heading text-lg font-bold tracking-tight">
        {filtered ? "Nothing matches that search" : "No public brands"}
      </h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {filtered
          ? "Try a different brand name or clear the search."
          : "Active, public brands will appear here."}
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
        Could not load brands
      </h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        The brand list did not answer. This is usually a connection problem.
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
          <Skeleton className="size-12 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
          <Skeleton className="hidden h-4 w-32 lg:block" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
