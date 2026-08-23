"use client";

/**
 * The products screen.
 *
 * Filter state lives in the URL, so a filtered page is something staff can
 * bookmark or paste into a message - "the thing I'm looking at" rather than
 * "search for laptops, then page 3".
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import {
  PackagePlus,
  PackageSearch,
  Plus,
  RefreshCw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { AdminProductRow, AdminProductQuery } from "@/lib/api/admin/products";
import { productPermissions } from "@/lib/panel/permissions";
import { useAuth } from "@/lib/auth/auth-context";
import {
  useAdminProducts,
  useDeleteProduct,
  useTaxonomy,
  useToggleFeatured,
} from "@/hooks/use-admin-products";
import { PanelPageHeading } from "@/components/panel/page-heading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pager } from "@/components/panel/pager";
import {
  ProductFilters,
  PRODUCT_SORTS,
  type ProductFilterState,
} from "./product-filters";
import { ProductsTable } from "./products-table";

export function ProductsView() {
  const topRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const permissions = productPermissions(user);

  const [
    {
      q,
      category,
      brand,
      status,
      visibility,
      type,
      stock,
      featured,
      minPrice,
      maxPrice,
      createdFrom,
      createdTo,
      updatedFrom,
      updatedTo,
      sort,
      limit,
      page,
    },
    setQuery,
  ] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      category: parseAsString.withDefault(""),
      brand: parseAsString.withDefault(""),
      status: parseAsString.withDefault(""),
      visibility: parseAsString.withDefault(""),
      type: parseAsString.withDefault(""),
      stock: parseAsString.withDefault(""),
      featured: parseAsString.withDefault("any"),
      minPrice: parseAsString.withDefault(""),
      maxPrice: parseAsString.withDefault(""),
      createdFrom: parseAsString.withDefault(""),
      createdTo: parseAsString.withDefault(""),
      updatedFrom: parseAsString.withDefault(""),
      updatedTo: parseAsString.withDefault(""),
      sort: parseAsString.withDefault("newest"),
      limit: parseAsString.withDefault("20"),
      // One-based, because a person reads this one: `?page=3` is the page the
      // table says it is, and page 1 stays off the URL entirely. The API
      // counts from zero, so the translation happens here and nowhere else.
      page: parseAsInteger.withDefault(1),
    },
    { history: "replace", shallow: true, clearOnDefault: true },
  );

  // `?page=0`, `?page=-2` and `?page=banana` are all reachable by hand and
  // none of them are a page; each should land on the first one rather than
  // put a negative offset on the wire.
  const pageIndex = Math.max(1, page) - 1;

  const chosen =
    PRODUCT_SORTS.find((option) => option.value === sort) ?? PRODUCT_SORTS[0];
  const pageSize = pageLimit(limit);
  const filters: ProductFilterState = {
    search: q,
    categoryId: category,
    brandId: brand,
    status: productStatus(status),
    visibility: productVisibility(visibility),
    productType: productType(type),
    stockStatus: stockStatus(stock),
    featured: featured === "yes" || featured === "no" ? featured : "any",
    minPrice,
    maxPrice,
    createdFrom,
    createdTo,
    updatedFrom,
    updatedTo,
    sort: chosen.value,
    limit: String(pageSize),
  };

  const query: AdminProductQuery = useMemo(
    () => {
      const price = priceRange(minPrice, maxPrice);

      return {
        ...(q ? { search: q } : {}),
        ...(category ? { categoryId: category } : {}),
        ...(brand ? { brandId: brand } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.visibility ? { visibility: filters.visibility } : {}),
        ...(filters.productType ? { productType: filters.productType } : {}),
        ...(filters.stockStatus ? { stockStatus: filters.stockStatus } : {}),
        ...(filters.featured !== "any"
          ? { featured: filters.featured === "yes" }
          : {}),
        ...(price ? { price } : {}),
        ...(createdFrom ? { createdFrom } : {}),
        ...(createdTo ? { createdTo } : {}),
        ...(updatedFrom ? { updatedFrom } : {}),
        ...(updatedTo ? { updatedTo } : {}),
        sort: { field: chosen.field, direction: chosen.direction },
        pagination: { page: pageIndex, limit: pageSize },
      };
    },
    [
      brand,
      category,
      chosen.direction,
      chosen.field,
      createdFrom,
      createdTo,
      filters.featured,
      filters.productType,
      filters.status,
      filters.stockStatus,
      filters.visibility,
      maxPrice,
      minPrice,
      pageIndex,
      pageSize,
      q,
      updatedFrom,
      updatedTo,
    ],
  );
  const queryMarker = useMemo(() => JSON.stringify(query), [query]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [queryMarker]);

  const { products, meta, isLoading, isFetching, isError, refetch } =
    useAdminProducts(query);
  // The filter offers every category, parents included - narrowing by a
  // parent expands to its subtree on the API.
  const { tree, brands } = useTaxonomy();

  const toggleFeatured = useToggleFeatured(query);
  const remove = useDeleteProduct();

  const [pendingDelete, setPendingDelete] = useState<AdminProductRow | null>(
    null,
  );

  // A new filter restarts paging; page 3 of "all" is rarely page 3 of a search.
  const applyFilters = (patch: Partial<ProductFilterState>) => {
    void setQuery({
      q: textParam(patch.search ?? filters.search),
      category: textParam(patch.categoryId ?? filters.categoryId),
      brand: textParam(patch.brandId ?? filters.brandId),
      status: textParam(patch.status ?? filters.status),
      visibility: textParam(patch.visibility ?? filters.visibility),
      type: textParam(patch.productType ?? filters.productType),
      stock: textParam(patch.stockStatus ?? filters.stockStatus),
      featured: patch.featured ?? filters.featured,
      minPrice: textParam(patch.minPrice ?? filters.minPrice),
      maxPrice: textParam(patch.maxPrice ?? filters.maxPrice),
      createdFrom: textParam(patch.createdFrom ?? filters.createdFrom),
      createdTo: textParam(patch.createdTo ?? filters.createdTo),
      updatedFrom: textParam(patch.updatedFrom ?? filters.updatedFrom),
      updatedTo: textParam(patch.updatedTo ?? filters.updatedTo),
      sort: patch.sort ?? filters.sort,
      limit: patch.limit ?? filters.limit,
      page: null,
    });
  };

  const clearFilters = () => {
    void setQuery({
      q: null,
      category: null,
      brand: null,
      status: null,
      visibility: null,
      type: null,
      stock: null,
      featured: null,
      minPrice: null,
      maxPrice: null,
      createdFrom: null,
      createdTo: null,
      updatedFrom: null,
      updatedTo: null,
      sort: null,
      limit: null,
      page: null,
    });
  };

  const filtered = Object.entries(filters).some(([key, value]) => {
    if (key === "sort") return value !== "newest";
    if (key === "limit") return value !== "20";
    if (key === "featured") return value !== "any";
    return Boolean(value);
  });

  return (
    <>
      <div
        ref={topRef}
        className="flex min-w-0 scroll-mt-24 flex-col gap-4 lg:h-[calc(100svh-var(--h-header)-3rem)] lg:min-h-0"
      >
        <div className="sticky top-header z-20 -mt-4 flex min-w-0 flex-col gap-3 border-b bg-background/95 pt-4 pb-3 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-lg sm:-mt-6 sm:pt-6">
          <PanelPageHeading
            title="Products"
            description="Everything in the catalogue, and the way in to editing it."
            action={
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  className="h-10 cursor-pointer gap-2 rounded-lg text-sm"
                >
                  <RefreshCw
                    className={cn("size-4", isFetching && "animate-spin")}
                    aria-hidden
                  />
                  <span className="max-sm:sr-only">Refresh</span>
                </Button>
                {permissions.create ? (
                <Button
                  className="h-10 cursor-pointer gap-2 rounded-lg text-sm font-semibold"
                  render={<Link href="/admin/products/new" />}
                >
                  <Plus className="size-4" aria-hidden />
                  <span className="max-sm:sr-only">New product</span>
                </Button>
                ) : null}
              </div>
            }
          />

          <ProductFilters
            value={filters}
            onChange={applyFilters}
            onClear={clearFilters}
            categories={tree}
            brands={brands}
            resultCount={meta?.total ?? null}
          />
        </div>

        {/*
          * Said once, at the top, rather than discovered when a draft goes
          * missing. The listing endpoint applies the storefront's own
          * visibility rules, so anything unpublished is absent from every page
          * of this table - see `lib/api/admin/products`.
          */}
        {/* <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <AlertTriangle
            className="mt-px size-3.5 shrink-0 text-warning-foreground dark:text-warning"
            aria-hidden
          />
          This list shows published products only. A product saved as
          <strong className="font-semibold text-foreground"> Draft </strong>
          or
          <strong className="font-semibold text-foreground"> Hidden </strong>
          will not appear here — open it from its own link, or set it back to
          Active and Public.
        </p> */}

        <div className="flex min-w-0 min-h-0 flex-1 flex-col gap-4">
          {isError ? (
            <Failed onRetry={() => void refetch()} />
          ) : isLoading ? (
            <TableSkeleton />
          ) : products.length === 0 ? (
            <Empty
              filtered={filtered}
              canCreate={permissions.create}
              onClear={clearFilters}
            />
          ) : (
            <>
              <ProductsTable
                products={products}
                permissions={permissions}
                busy={isFetching}
                onToggleFeatured={(product, featured) =>
                  toggleFeatured.mutate({ id: product.id, featured })
                }
                onDelete={setPendingDelete}
              />

              {/*
              * Rides the bottom edge, like the search and tabs ride the top.
              * On a phone the card list is far taller than the viewport, and a
              * pager you have to reach the end of to use is one people scroll
              * past looking for. Negative margins take it to the edges of the
              * shell's padding so the blur covers the full width.
              */}
              <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t bg-background/95 px-4 py-3 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-lg sm:-mx-6 sm:-mb-6 sm:px-6">
                {meta ? (
                  <Pager
                    meta={meta}
                    shown={products.length}
                    noun="products"
                    onPageChange={(next) => void setQuery({ page: next + 1 })}
                  />
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archive “{pendingDelete?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from the storefront and from this list. The record
              is kept rather than destroyed, so existing orders that reference
              it stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer rounded-lg">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) remove.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
              className="cursor-pointer rounded-lg bg-destructive text-white hover:bg-destructive/90"
            >
              Archive product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Empty({
  filtered,
  canCreate,
  onClear,
}: {
  filtered: boolean;
  canCreate: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {filtered ? (
          <PackageSearch className="size-7" aria-hidden />
        ) : (
          <PackagePlus className="size-7" aria-hidden />
        )}
      </span>
      <h2 className="font-heading text-lg font-bold tracking-tight">
        {filtered ? "Nothing matches those filters" : "No published products"}
      </h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {filtered
          ? "Try a different search, or clear the category filter."
          : "Either the catalogue is empty, or everything in it is still a draft."}
      </p>

      {filtered ? (
        <Button
          variant="outline"
          onClick={onClear}
          className="mt-6 h-10 cursor-pointer rounded-lg px-5 text-sm font-semibold"
        >
          Clear filters
        </Button>
      ) : canCreate ? (
        <Button
          className="mt-6 h-10 cursor-pointer gap-2 rounded-lg px-5 text-sm font-semibold"
          render={<Link href="/admin/products/new" />}
        >
          <Plus className="size-4" aria-hidden />
          Add the first product
        </Button>
      ) : null}
    </div>
  );
}

function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <h2 className="font-heading text-lg font-bold tracking-tight">
        Could not load products
      </h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        The catalogue did not answer. This is usually a connection problem.
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

function textParam(value: string) {
  return value.trim() ? value : null;
}

function pageLimit(value: string) {
  const numeric = Number(value);
  return [20, 50, 100].includes(numeric) ? numeric : 20;
}

function priceRange(min: string, max: string) {
  const range: { min?: number; max?: number } = {};
  const minValue = Number(min);
  const maxValue = Number(max);

  if (min.trim() && Number.isFinite(minValue)) range.min = minValue;
  if (max.trim() && Number.isFinite(maxValue)) range.max = maxValue;

  return Object.keys(range).length > 0 ? range : null;
}

function productStatus(value: string): ProductFilterState["status"] {
  return value === "DRAFT" || value === "ACTIVE" || value === "OUT_OF_STOCK"
    ? value
    : "";
}

function productVisibility(value: string): ProductFilterState["visibility"] {
  return value === "PUBLIC" || value === "HIDDEN" ? value : "";
}

function productType(value: string): ProductFilterState["productType"] {
  return value === "SIMPLE" || value === "VARIABLE" ? value : "";
}

function stockStatus(value: string): ProductFilterState["stockStatus"] {
  return value === "IN_STOCK" || value === "OUT_OF_STOCK" || value === "BACKORDER"
    ? value
    : "";
}

function TableSkeleton() {
  return (
    <div className={cn("flex flex-col gap-3")}>
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-xl border p-3"
        >
          <Skeleton className="size-12 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
          <Skeleton className="hidden h-6 w-24 rounded-full lg:block" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
