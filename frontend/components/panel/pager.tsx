"use client";

/**
 * The panel's paged navigation, shared by every table in it.
 *
 * Lives here rather than beside one screen because the second table to want it
 * would otherwise copy eighty lines of markup, and the two would drift the
 * first time either was touched.
 *
 * It speaks the API's zero-based `PaginationMeta` in both directions - the
 * page it reports and the page it asks for are both indices. Translating those
 * into whatever a URL or a label shows is the caller's business; this only
 * knows where it is in a result set.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";

import type { PaginationMeta } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";

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
export function Pager({
  meta,
  shown,
  noun,
  onPageChange,
}: {
  meta: PaginationMeta;
  /** Rows on screen right now, which is not `limit` on the last page. */
  shown: number;
  /** Plural, for the count beside the numbers: "products", "orders". */
  noun: string;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
      {/*
       * `10/200 orders` - on screen over the whole matching set.
       *
       * One shape for every case, including the one where everything already
       * fits on a single page. Branching on the page count is what made this
       * read `10 orders` on a quiet day: true, but indistinguishable from
       * "there are only ten", which is the one thing it must not be mistaken
       * for. `200/200 orders` is faintly redundant and never ambiguous.
       */}
      <p className="text-sm text-muted-foreground tabular-nums">
        {meta.total === 0 ? (
          <>No {noun}</>
        ) : (
          <>
            <span className="font-medium text-foreground">{shown}</span>
            <span className="mx-0.5 opacity-60">/</span>
            <span className="font-medium text-foreground">{meta.total}</span>{" "}
            {meta.total === 1 ? noun.replace(/s$/, "") : noun}
          </>
        )}
      </p>

      {meta.totalPages > 1 ? (
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
      ) : null}
    </div>
  );
}
