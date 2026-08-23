"use client";

import Image from "next/image";
import { ExternalLink, ImageOff, Pencil, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BrandPermissions } from "@/lib/panel/permissions";
import type { AdminBrand } from "@/lib/api/admin/brands";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CatalogStatusBadge, VisibilityBadge } from "./brand-badges";

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

export function BrandsTable({
  brands,
  permissions,
  busy,
  onEdit,
  onDelete,
}: {
  brands: AdminBrand[];
  permissions: BrandPermissions;
  busy: boolean;
  onEdit: (brand: AdminBrand) => void;
  onDelete: (brand: AdminBrand) => void;
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
        <Table className="min-w-[1040px]">
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow className="bg-muted hover:bg-muted">
              <TableHead className="pl-4">Brand</TableHead>
              <TableHead>Lifecycle</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-24 pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.map((brand) => (
              <TableRow key={brand.id}>
                <TableCell className="pl-4">
                  <BrandIdentity brand={brand} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    <CatalogStatusBadge status={brand.status} />
                    <VisibilityBadge visibility={brand.visibility} />
                  </div>
                </TableCell>
                <TableCell>
                  <Website brand={brand} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {dateTime(brand.publishedAt)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {dateTime(brand.updatedAt)}
                </TableCell>
                <TableCell className="pr-4">
                  <RowActions
                    brand={brand}
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

      <div className={cn("grid gap-3 lg:hidden", busy && "opacity-60")}>
        {brands.map((brand) => (
          <article key={brand.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <BrandIdentity brand={brand} />
              <RowActions
                brand={brand}
                permissions={permissions}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
            {brand.description ? (
              <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                {brand.description}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <CatalogStatusBadge status={brand.status} />
              <VisibilityBadge visibility={brand.visibility} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Published</dt>
                <dd className="mt-0.5 font-medium">{dateTime(brand.publishedAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Updated</dt>
                <dd className="mt-0.5 font-medium">{dateTime(brand.updatedAt)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Website</dt>
                <dd className="mt-0.5 font-medium">
                  <Website brand={brand} />
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

function BrandIdentity({ brand }: { brand: AdminBrand }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
        {brand.logo ? (
          <Image
            src={brand.logo}
            alt=""
            fill
            sizes="48px"
            className="object-contain p-1"
          />
        ) : (
          <ImageOff className="size-4 text-muted-foreground" aria-hidden />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold">{brand.name}</p>
        <p className="truncate text-xs text-muted-foreground">{brand.slug}</p>
      </div>
    </div>
  );
}

function Website({ brand }: { brand: AdminBrand }) {
  if (!brand.website) return <span className="text-xs text-muted-foreground">No website</span>;

  return (
    <a
      href={brand.website}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-w-0 max-w-60 items-center gap-1.5 text-xs text-foreground hover:text-brand"
    >
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{brand.website}</span>
    </a>
  );
}

function RowActions({
  brand,
  permissions,
  onEdit,
  onDelete,
}: {
  brand: AdminBrand;
  permissions: BrandPermissions;
  onEdit: (brand: AdminBrand) => void;
  onDelete: (brand: AdminBrand) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {permissions.edit ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit ${brand.name}`}
          onClick={() => onEdit(brand)}
          className="size-9 cursor-pointer rounded-lg"
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
      ) : null}

      {permissions.remove ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Archive ${brand.name}`}
          onClick={() => onDelete(brand)}
          className="size-9 cursor-pointer rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
