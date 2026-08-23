"use client";

/**
 * The products screen.
 *
 * Filter state lives in the URL, so a filtered page is something staff can
 * bookmark or paste into a message - "the thing I'm looking at" rather than
 * "search for laptops, then page 3".
 */

import { useState } from "react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  PackagePlus,
  PackageSearch,
  Plus,
  RefreshCw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { AdminProductRow, AdminProductQuery } from "@/lib/api/admin/products";
import type { PaginationMeta } from "@/lib/api/types";
import { productPermissions } from "@/lib/panel/permissions";
import { useAuth } from "@/lib/auth/auth-context";
import {
  PRODUCTS_PAGE_SIZE,
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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import { ProductFilters, PRODUCT_SORTS } from "./product-filters";
import { ProductsTable } from "./products-table";

export function ProductsView() {
  const { user } = useAuth();
  const permissions = productPermissions(user);

  const [{ q, category, sort, page }, setQuery] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      category: parseAsString.withDefault(""),
      sort: parseAsString.withDefault("newest"),
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

  const query: AdminProductQuery = {
    ...(q ? { search: q } : {}),
    ...(category ? { categoryId: category } : {}),
    sort: { field: chosen.field, direction: chosen.direction },
    pagination: { page: pageIndex, limit: PRODUCTS_PAGE_SIZE },
  };

  const { products, meta, isLoading, isFetching, isError, refetch } =
    useAdminProducts(query);
  // The filter offers every category, parents included - narrowing by a
  // parent expands to its subtree on the API.
  const { tree } = useTaxonomy();

  const toggleFeatured = useToggleFeatured(query);
  const remove = useDeleteProduct();

  const [pendingDelete, setPendingDelete] = useState<AdminProductRow | null>(
    null,
  );

  // A new filter restarts paging; page 3 of "all" is rarely page 3 of a search.
  const filtered = Boolean(q || category);

  return (
    <>
      <PanelPageHeading
        title="Products"
        description="Everything in the catalogue, and the way in to editing it."
        action={
          permissions.create ? (
            <Button
              className="h-10 cursor-pointer gap-2 rounded-lg text-sm font-semibold"
              render={<Link href="/admin/products/new" />}
            >
              <Plus className="size-4" aria-hidden />
              <span className="max-sm:sr-only">New product</span>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-4">
        <ProductFilters
          search={q}
          onSearchChange={(value) =>
            void setQuery({ q: value || null, page: null })
          }
          categoryId={category}
          onCategoryChange={(value) =>
            void setQuery({ category: value || null, page: null })
          }
          sort={sort}
          onSortChange={(value) => void setQuery({ sort: value, page: null })}
          categories={tree}
        />

        {/*
          * Said once, at the top, rather than discovered when a draft goes
          * missing. The listing endpoint applies the storefront's own
          * visibility rules, so anything unpublished is absent from every page
          * of this table - see `lib/api/admin/products`.
          */}
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
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
        </p>

        {isError ? (
          <Failed onRetry={() => void refetch()} />
        ) : isLoading ? (
          <TableSkeleton />
        ) : products.length === 0 ? (
          <Empty
            filtered={filtered}
            canCreate={permissions.create}
            onClear={() => void setQuery({ q: null, category: null, page: null })}
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

            {meta && meta.totalPages > 1 ? (
              <Pager
                meta={meta}
                shown={products.length}
                onPageChange={(next) => void setQuery({ page: next + 1 })}
              />
            ) : null}
          </>
        )}
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

/*
 * Seven slots, always: the first page, the last page, a window around the
 * current one, and an ellipsis wherever pages are skipped. The count is fixed
 * so the row keeps its width - page 9 does not slide out from under the
 * cursor that was aimed at page 8.
 *
 * Pages are zero-based here, as they are on the API; only the labels add one.
 */
const PAGER_SLOTS = 7;

function pagerItems(current: number, total: number): Array<number | "gap"> {
  if (total <= PAGER_SLOTS) {
    return Array.from({ length: total }, (_, index) => index);
  }

  const last = total - 1;

  // Near either end there is nothing to elide on that side, so the window
  // opens out instead and the single ellipsis moves to the far side.
  if (current <= 3) return [0, 1, 2, 3, 4, "gap", last];
  if (current >= last - 3) {
    return [0, "gap", last - 4, last - 3, last - 2, last - 1, last];
  }

  return [0, "gap", current - 1, current, current + 1, "gap", last];
}

/**
 * Paging by number rather than by step.
 *
 * The buttons are buttons, not links: a page change here is the same shallow
 * URL write as every filter above it, so there is no navigation for an anchor
 * to describe.
 */
function Pager({
  meta,
  shown,
  onPageChange,
}: {
  meta: PaginationMeta;
  shown: number;
  onPageChange: (page: number) => void;
}) {
  const first = meta.page * meta.limit + 1;

  return (
    <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-muted-foreground tabular-nums">
        {first}–{first + shown - 1} of {meta.total} products
      </p>

      <Pagination className="mx-0 w-auto justify-center sm:justify-end">
        <PaginationContent className="gap-1 sm:gap-1.5">
          <PaginationItem>
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous page"
              disabled={!meta.hasPrevPage}
              onClick={() => onPageChange(meta.page - 1)}
              className="size-9 cursor-pointer rounded-lg sm:size-10"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
          </PaginationItem>

          {pagerItems(meta.page, meta.totalPages).map((item, index) =>
            item === "gap" ? (
              <PaginationItem key={`gap-${index}`}>
                <PaginationEllipsis className="size-9 sm:size-10" />
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <Button
                  variant={item === meta.page ? "default" : "ghost"}
                  size="icon"
                  aria-label={`Page ${item + 1}`}
                  aria-current={item === meta.page ? "page" : undefined}
                  onClick={() => onPageChange(item)}
                  className="size-9 cursor-pointer rounded-lg text-sm font-medium tabular-nums sm:size-10"
                >
                  {item + 1}
                </Button>
              </PaginationItem>
            ),
          )}

          <PaginationItem>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next page"
              disabled={!meta.hasNextPage}
              onClick={() => onPageChange(meta.page + 1)}
              className="size-9 cursor-pointer rounded-lg sm:size-10"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
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
