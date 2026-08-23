"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { Braces, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { attributePermissions } from "@/lib/panel/permissions";
import {
  ATTRIBUTE_SOURCES,
  ATTRIBUTE_TYPES,
  CATALOG_STATUSES,
  type AdminAttribute,
  type AdminAttributeQuery,
  type AttributeSource,
  type AttributeType,
  type AttributeWritePayload,
  type CatalogStatus,
} from "@/lib/api/admin/attributes";
import {
  ATTRIBUTES_PAGE_SIZE,
  useAdminAttributes,
  useCreateAttribute,
  useDeleteAttribute,
  useUpdateAttribute,
} from "@/hooks/use-admin-attributes";
import { PanelPageHeading } from "@/components/panel/page-heading";
import { Pager } from "@/components/panel/pager";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AttributeFilters } from "./attribute-filters";
import {
  AttributeFormDialog,
  DeleteAttributeDialog,
} from "./attribute-dialogs";
import { AttributesTable } from "./attributes-table";

const SEARCH_DEBOUNCE_MS = 350;

function validOption<T extends string>(value: string, options: readonly T[]): T | "" {
  return options.includes(value as T) ? (value as T) : "";
}

export function AttributesView() {
  const topRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const permissions = attributePermissions(user);
  const [state, setQuery] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      source: parseAsString.withDefault(""),
      type: parseAsString.withDefault(""),
      status: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
    },
    { history: "replace", shallow: true, clearOnDefault: true },
  );

  const source = validOption(state.source, ATTRIBUTE_SOURCES);
  const type = validOption(state.type, ATTRIBUTE_TYPES);
  const status = validOption(state.status, CATALOG_STATUSES);
  const pageIndex = Math.max(1, state.page) - 1;
  const query: AdminAttributeQuery = useMemo(
    () => ({
      ...(state.q ? { search: state.q } : {}),
      ...(source ? { source: source as AttributeSource } : {}),
      ...(type ? { type: type as AttributeType } : {}),
      ...(status ? { status: status as CatalogStatus } : {}),
      page: pageIndex,
      limit: ATTRIBUTES_PAGE_SIZE,
    }),
    [pageIndex, source, state.q, status, type],
  );
  const queryMarker = useMemo(() => JSON.stringify(query), [query]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [queryMarker]);

  const { attributes, meta, isLoading, isFetching, isError, refetch } =
    useAdminAttributes(query);
  const [searchInput, setSearchInput] = useState(state.q);
  const [editing, setEditing] = useState<AdminAttribute | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminAttribute | null>(null);

  const create = useCreateAttribute();
  const update = useUpdateAttribute();
  const remove = useDeleteAttribute();

  useEffect(() => {
    if (searchInput === state.q) return;
    const timer = setTimeout(() => {
      void setQuery({ q: searchInput || null, page: null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, setQuery, state.q]);

  const clearFilters = () => {
    setSearchInput("");
    void setQuery({ q: null, source: null, type: null, status: null, page: null });
  };

  const saveAttribute = (body: AttributeWritePayload) => {
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
        className="flex min-w-0 scroll-mt-24 flex-col gap-4 lg:h-[calc(100svh-var(--h-header)-3rem)] lg:min-h-0"
      >
        <div className="sticky top-header z-20 -mt-4 flex min-w-0 flex-col gap-3 border-b bg-background/95 pt-4 pb-3 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-lg sm:-mt-6 sm:pt-6">
          <PanelPageHeading
            title="Attributes"
            description="Reusable catalog fields for product details, filters and variants."
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
                    <span className="max-sm:sr-only">New attribute</span>
                  </Button>
                ) : null}
              </div>
            }
          />

          <AttributeFilters
            value={{ search: searchInput, source, type, status }}
            onChange={(patch) => {
              if (patch.search !== undefined) setSearchInput(patch.search);
              if (
                patch.source !== undefined ||
                patch.type !== undefined ||
                patch.status !== undefined
              ) {
                void setQuery({
                  source: (patch.source ?? source) || null,
                  type: (patch.type ?? type) || null,
                  status: (patch.status ?? status) || null,
                  page: null,
                });
              }
            }}
            onClear={clearFilters}
          />
        </div>

        <div className="flex min-w-0 min-h-0 flex-1 flex-col gap-4">
          {isError ? (
            <Failed onRetry={() => void refetch()} />
          ) : isLoading ? (
            <TableSkeleton />
          ) : attributes.length === 0 ? (
            <Empty
              filtered={Boolean(state.q || source || type || status)}
              onClear={clearFilters}
            />
          ) : (
            <>
              <AttributesTable
                attributes={attributes}
                permissions={permissions}
                busy={isFetching}
                onEdit={(attribute) => {
                  setEditing(attribute);
                  setFormOpen(true);
                }}
                onDelete={setPendingDelete}
              />

              <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t bg-background/95 px-4 py-3 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-lg sm:-mx-6 sm:-mb-6 sm:px-6">
                {meta ? (
                  <Pager
                    meta={meta}
                    shown={attributes.length}
                    noun="attributes"
                    onPageChange={(next) => void setQuery({ page: next + 1 })}
                  />
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      <AttributeFormDialog
        open={formOpen}
        attribute={editing}
        saving={create.isPending || update.isPending}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        onSave={saveAttribute}
      />

      <DeleteAttributeDialog
        attribute={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={(attribute) => {
          remove.mutate(attribute.id);
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
        {filtered ? <SlidersHorizontal className="size-7" aria-hidden /> : <Braces className="size-7" aria-hidden />}
      </span>
      <h2 className="font-heading text-lg font-bold tracking-tight">
        {filtered ? "Nothing matches those filters" : "No attributes yet"}
      </h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {filtered
          ? "Try a different search or clear the attribute filters."
          : "Create reusable attributes for product specs, storefront filters and variant options."}
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
        Could not load attributes
      </h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        The attribute list did not answer. This is usually a connection problem.
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
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
          <Skeleton className="hidden h-6 w-24 rounded-full lg:block" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
