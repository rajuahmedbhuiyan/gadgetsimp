"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { Boxes, RefreshCw, SearchX } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { variationPermissions } from "@/lib/panel/permissions";
import {
  PRODUCT_STATUSES,
  type AdminVariation,
  type AdminVariationQuery,
  type ProductStatus,
  type VariationPatchPayload,
} from "@/lib/api/admin/variations";
import {
  VARIATIONS_PAGE_SIZE,
  useAdminVariations,
  useDeleteVariation,
  useUpdateVariation,
} from "@/hooks/use-admin-variations";
import { PanelPageHeading } from "@/components/panel/page-heading";
import { Pager } from "@/components/panel/pager";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  VariationFilters,
  type VariationFilterState,
} from "./variation-filters";
import {
  DeleteVariationDialog,
  VariationFormDialog,
} from "./variation-dialogs";
import { VariationsTable } from "./variations-table";

const SEARCH_DEBOUNCE_MS = 350;

function validStatus(value: string): ProductStatus | "" {
  return PRODUCT_STATUSES.includes(value as ProductStatus)
    ? (value as ProductStatus)
    : "";
}

export function VariationsView() {
  const topRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const permissions = variationPermissions(user);
  const [state, setQuery] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      productId: parseAsString.withDefault(""),
      status: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
    },
    { history: "replace", shallow: true, clearOnDefault: true },
  );

  const status = validStatus(state.status);
  const pageIndex = Math.max(1, state.page) - 1;
  const query: AdminVariationQuery = useMemo(
    () => ({
      ...(state.q ? { search: state.q } : {}),
      ...(state.productId ? { productId: state.productId } : {}),
      ...(status ? { status } : {}),
      pagination: { page: pageIndex, limit: VARIATIONS_PAGE_SIZE },
    }),
    [pageIndex, state.productId, state.q, status],
  );
  const queryMarker = useMemo(() => JSON.stringify(query), [query]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [queryMarker]);

  const { variations, meta, isLoading, isFetching, isError, refetch } =
    useAdminVariations(query);
  const [filters, setFilters] = useState<VariationFilterState>({
    search: state.q,
    productId: state.productId,
    status,
  });
  const [editing, setEditing] = useState<AdminVariation | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminVariation | null>(null);

  const update = useUpdateVariation();
  const remove = useDeleteVariation();

  useEffect(() => {
    if (
      filters.search === state.q &&
      filters.productId === state.productId &&
      filters.status === status
    ) {
      return;
    }

    const timer = setTimeout(() => {
      void setQuery({
        q: filters.search || null,
        productId: filters.productId || null,
        status: filters.status || null,
        page: null,
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters, setQuery, state.productId, state.q, status]);

  const clearFilters = () => {
    setFilters({ search: "", productId: "", status: "" });
    void setQuery({ q: null, productId: null, status: null, page: null });
  };

  const saveVariation = (body: VariationPatchPayload) => {
    if (!editing) return;
    update.mutate(
      { id: editing.id, body },
      { onSuccess: () => setEditing(null) },
    );
  };

  const filtered = Boolean(state.q || state.productId || status);

  return (
    <>
      <div
        ref={topRef}
        className="flex min-w-0 scroll-mt-24 flex-col gap-4 lg:h-[calc(100svh-var(--h-header)-3rem)] lg:min-h-0"
      >
        <div className="sticky top-header z-20 -mt-4 flex min-w-0 flex-col gap-3 border-b bg-background/95 pt-4 pb-3 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-lg sm:-mt-6 sm:pt-6">
          <PanelPageHeading
            title="Variations"
            description="Variant SKUs, option combinations, prices and stock."
            action={
              <Button variant="outline" onClick={() => void refetch()} disabled={isFetching} className="h-10 cursor-pointer gap-2 rounded-lg text-sm">
                <RefreshCw className={cn("size-4", isFetching && "animate-spin")} aria-hidden />
                <span className="max-sm:sr-only">Refresh</span>
              </Button>
            }
          />

          <VariationFilters
            value={filters}
            onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
            onClear={clearFilters}
          />
        </div>

        <div className="flex min-w-0 min-h-0 flex-1 flex-col gap-4">
          {isError ? (
            <Failed onRetry={() => void refetch()} />
          ) : isLoading ? (
            <TableSkeleton />
          ) : variations.length === 0 ? (
            <Empty filtered={filtered} onClear={clearFilters} />
          ) : (
            <>
              <VariationsTable
                variations={variations}
                permissions={permissions}
                busy={isFetching}
                onEdit={setEditing}
                onDelete={setPendingDelete}
              />

              <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t bg-background/95 px-4 py-3 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-lg sm:-mx-6 sm:-mb-6 sm:px-6">
                {meta ? (
                  <Pager
                    meta={meta}
                    shown={variations.length}
                    noun="variations"
                    onPageChange={(next) => void setQuery({ page: next + 1 })}
                  />
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      <VariationFormDialog
        open={editing !== null}
        variation={editing}
        saving={update.isPending}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={saveVariation}
      />

      <DeleteVariationDialog
        variation={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={(variation) => {
          remove.mutate(variation.id);
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
        {filtered ? <SearchX className="size-7" aria-hidden /> : <Boxes className="size-7" aria-hidden />}
      </span>
      <h2 className="font-heading text-lg font-bold tracking-tight">
        {filtered ? "Nothing matches those filters" : "No variations yet"}
      </h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {filtered
          ? "Try another SKU, barcode, product id or status."
          : "Variable products create variation rows from their option combinations."}
      </p>
      {filtered ? (
        <Button variant="outline" onClick={onClear} className="mt-6 h-10 cursor-pointer rounded-lg px-5 text-sm font-semibold">
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
        Could not load variations
      </h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        The variation list did not answer. This is usually a connection problem.
      </p>
      <Button variant="outline" onClick={onRetry} className="mt-6 h-10 cursor-pointer gap-2 rounded-lg px-5 text-sm font-semibold">
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
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
