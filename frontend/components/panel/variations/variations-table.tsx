"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink, ImageOff, Pencil, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { VariationPermissions } from "@/lib/panel/permissions";
import type { AdminVariation } from "@/lib/api/admin/variations";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductStatusBadge, StockStatusBadge } from "./variation-badges";

function money(value: number | undefined, currency: string) {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function dateTime(value: string | null | undefined) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function VariationsTable({
  variations,
  permissions,
  busy,
  onEdit,
  onDelete,
}: {
  variations: AdminVariation[];
  permissions: VariationPermissions;
  busy: boolean;
  onEdit: (variation: AdminVariation) => void;
  onDelete: (variation: AdminVariation) => void;
}) {
  return (
    <>
      <div
        className={cn(
          "hidden min-h-0 flex-1 rounded-xl border bg-card lg:block",
          "[&>[data-slot=table-container]]:h-full",
          "[&>[data-slot=table-container]]:overflow-auto",
          busy && "opacity-60",
        )}
      >
        <Table className="min-w-[1180px]">
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow className="bg-muted hover:bg-muted">
              <TableHead className="pl-4">Variation</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Options</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-24 pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variations.map((variation) => (
              <TableRow key={variation.id}>
                <TableCell className="pl-4">
                  <VariationIdentity variation={variation} />
                </TableCell>
                <TableCell>
                  <ProductLink variation={variation} />
                </TableCell>
                <TableCell>
                  <Options variation={variation} />
                </TableCell>
                <TableCell>
                  <Price variation={variation} />
                </TableCell>
                <TableCell>
                  <Stock variation={variation} />
                </TableCell>
                <TableCell>
                  <ProductStatusBadge status={variation.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {dateTime(variation.updatedAt)}
                </TableCell>
                <TableCell className="pr-4">
                  <RowActions
                    variation={variation}
                    permissions={permissions}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className={cn("grid min-w-0 gap-3 lg:hidden", busy && "opacity-60")}>
        {variations.map((variation) => (
          <article key={variation.id} className="min-w-0 overflow-hidden rounded-xl border bg-card p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <VariationIdentity variation={variation} />
              <RowActions
                variation={variation}
                permissions={permissions}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
            <div className="mt-3">
              <ProductLink variation={variation} />
            </div>
            <div className="mt-3">
              <Options variation={variation} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div className="min-w-0">
                <dt className="text-muted-foreground">Price</dt>
                <dd className="mt-0.5 font-medium"><Price variation={variation} /></dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Stock</dt>
                <dd className="mt-0.5 font-medium"><Stock variation={variation} /></dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="mt-0.5"><ProductStatusBadge status={variation.status} /></dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Updated</dt>
                <dd className="mt-0.5 truncate font-medium">{dateTime(variation.updatedAt)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

function VariationIdentity({ variation }: { variation: AdminVariation }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
        {variation.image?.src ? (
          <Image src={variation.image.src} alt="" fill sizes="48px" className="object-cover" unoptimized />
        ) : (
          <ImageOff className="size-4 text-muted-foreground" aria-hidden />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold">{variation.sku}</p>
        <p className="truncate text-xs text-muted-foreground">
          {variation.barcode || "No barcode"}
        </p>
      </div>
    </div>
  );
}

function ProductLink({ variation }: { variation: AdminVariation }) {
  return (
    <Link
      href={`/admin/products/${variation.productId.id}`}
      className="block min-w-0 max-w-64 text-sm font-medium hover:text-brand"
    >
      <span className="block truncate">{variation.productId.name}</span>
      <span className="block truncate font-mono text-xs text-muted-foreground">
        {variation.productId.slug}
      </span>
    </Link>
  );
}

function Options({ variation }: { variation: AdminVariation }) {
  const entries = Object.entries(variation.options ?? {});
  if (entries.length === 0) return <span className="text-xs text-muted-foreground">No options</span>;

  return (
    <div className="flex max-w-72 flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <span key={key} className="max-w-full truncate rounded-full border bg-background px-2.5 py-1 text-xs">
          <span className="text-muted-foreground">{key}:</span> {value}
        </span>
      ))}
    </div>
  );
}

function Price({ variation }: { variation: AdminVariation }) {
  const currency = variation.productId.currency || "BDT";
  return (
    <span className="text-sm font-medium">
      {money(variation.sellingPrice, currency)}
      {variation.originalPrice != null ? (
        <span className="ml-1 text-xs text-muted-foreground line-through">
          {money(variation.originalPrice, currency)}
        </span>
      ) : null}
    </span>
  );
}

function Stock({ variation }: { variation: AdminVariation }) {
  const stock = variation.stock;
  if (!stock) return <span className="text-xs text-muted-foreground">No stock</span>;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-sm font-medium tabular-nums">{stock.quantity ?? 0}</span>
      <StockStatusBadge status={stock.status} />
    </span>
  );
}

function RowActions({
  variation,
  permissions,
  onEdit,
  onDelete,
}: {
  variation: AdminVariation;
  permissions: VariationPermissions;
  onEdit: (variation: AdminVariation) => void;
  onDelete: (variation: AdminVariation) => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Open ${variation.productId.name} in public product page`}
        className="size-9 cursor-pointer rounded-lg"
        render={
          <Link
            href={`/shop/${variation.productId.slug}`}
            target="_blank"
            rel="noreferrer"
          />
        }
      >
        <ExternalLink className="size-4" aria-hidden />
      </Button>
      {permissions.edit ? (
        <Button variant="ghost" size="icon" aria-label={`Edit ${variation.sku}`} onClick={() => onEdit(variation)} className="size-9 cursor-pointer rounded-lg">
          <Pencil className="size-4" aria-hidden />
        </Button>
      ) : null}
      {permissions.remove ? (
        <Button variant="ghost" size="icon" aria-label={`Delete ${variation.sku}`} onClick={() => onDelete(variation)} className="size-9 cursor-pointer rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
