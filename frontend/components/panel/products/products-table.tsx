"use client";

/**
 * The product list, in two shapes.
 *
 * A table below `lg` would either scroll sideways - which hides the actions
 * column, the one people came for - or shrink columns past the point of being
 * readable. So the same rows render as cards on a phone and as a table on a
 * desktop, from one set of data and one set of handlers.
 *
 * There is no status column. `POST /products/filter` returns the public
 * catalogue and its projection carries no `status` or `visibility`, so a badge
 * here would be invented rather than reported. What the row *can* say
 * truthfully is stock and whether it is featured.
 */

import Image from "next/image";
import Link from "next/link";
import { ImageOff, Pencil, Star, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPrice, formatPriceRange } from "@/lib/format";
import type { AdminProductRow } from "@/lib/api/admin/products";
import type { ProductPermissions } from "@/lib/panel/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ProductsTableProps {
  products: AdminProductRow[];
  permissions: ProductPermissions;
  busy: boolean;
  onToggleFeatured: (product: AdminProductRow, featured: boolean) => void;
  onDelete: (product: AdminProductRow) => void;
}

export function ProductsTable(props: ProductsTableProps) {
  return (
    <>
      <div className="hidden lg:block">
        <DesktopTable {...props} />
      </div>
      <div className="flex flex-col gap-3 lg:hidden">
        {props.products.map((product) => (
          <MobileCard key={product.id} product={product} {...props} />
        ))}
      </div>
    </>
  );
}

/* -------------------------------- desktop -------------------------------- */

function DesktopTable({
  products,
  permissions,
  busy,
  onToggleFeatured,
  onDelete,
}: ProductsTableProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl border", busy && "opacity-60")}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-[38%]">Product</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead className="text-center">Featured</TableHead>
            <TableHead className="w-24 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Thumb product={product} />
                  <div className="min-w-0">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="line-clamp-1 font-medium transition-colors hover:text-brand"
                    >
                      {product.name}
                    </Link>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {product.brandId?.name ? `${product.brandId.name} · ` : ""}
                      {product.slug}
                    </p>
                  </div>
                </div>
              </TableCell>

              <TableCell>
                <CategoryCell product={product} />
              </TableCell>

              <TableCell className="whitespace-nowrap tabular-nums">
                <PriceCell product={product} />
              </TableCell>

              <TableCell>
                <StockCell product={product} />
              </TableCell>

              <TableCell className="text-center">
                <Switch
                  checked={product.featured}
                  disabled={!permissions.edit}
                  aria-label={`Feature ${product.name}`}
                  onCheckedChange={(checked) =>
                    onToggleFeatured(product, checked === true)
                  }
                  className="cursor-pointer"
                />
              </TableCell>

              <TableCell>
                <RowActions
                  product={product}
                  permissions={permissions}
                  onDelete={onDelete}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* --------------------------------- mobile -------------------------------- */

function MobileCard({
  product,
  permissions,
  busy,
  onToggleFeatured,
  onDelete,
}: { product: AdminProductRow } & ProductsTableProps) {
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-3",
        busy && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <Thumb product={product} />

        <div className="min-w-0 flex-1">
          <Link
            href={`/admin/products/${product.id}`}
            className="line-clamp-2 text-sm font-medium transition-colors hover:text-brand"
          >
            {product.name}
          </Link>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {product.brandId?.name ?? "No brand"}
          </p>
          <p className="mt-1.5 text-sm font-bold text-price tabular-nums">
            <PriceCell product={product} />
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StockCell product={product} />
        <CategoryCell product={product} />
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
          <Switch
            checked={product.featured}
            disabled={!permissions.edit}
            aria-label={`Feature ${product.name}`}
            onCheckedChange={(checked) =>
              onToggleFeatured(product, checked === true)
            }
            className="cursor-pointer"
          />
          Featured
        </label>

        <RowActions
          product={product}
          permissions={permissions}
          onDelete={onDelete}
        />
      </div>
    </article>
  );
}

/* --------------------------------- pieces -------------------------------- */

function RowActions({
  product,
  permissions,
  onDelete,
}: {
  product: AdminProductRow;
  permissions: ProductPermissions;
  onDelete: (product: AdminProductRow) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {permissions.edit ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit ${product.name}`}
          className="size-9 cursor-pointer"
          render={<Link href={`/admin/products/${product.id}`} />}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
      ) : null}

      {permissions.remove ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Archive ${product.name}`}
          onClick={() => onDelete(product)}
          className="size-9 cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

function Thumb({ product }: { product: AdminProductRow }) {
  return (
    <span className="relative size-12 shrink-0 overflow-hidden rounded-lg border bg-muted/30">
      {product.thumbnail?.src ? (
        <Image
          src={product.thumbnail.src}
          alt=""
          fill
          sizes="48px"
          className="object-contain p-1"
        />
      ) : (
        <span className="flex h-full items-center justify-center text-muted-foreground">
          <ImageOff className="size-4" aria-hidden />
        </span>
      )}
      {product.featured ? (
        <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-brand text-brand-foreground">
          <Star className="size-2.5 fill-current" aria-hidden />
        </span>
      ) : null}
    </span>
  );
}

function CategoryCell({ product }: { product: AdminProductRow }) {
  const [first, ...rest] = product.categoryIds;

  if (!first) {
    return <span className="text-xs text-muted-foreground">Uncategorised</span>;
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge variant="secondary" className="font-normal">
        {first.name}
      </Badge>
      {rest.length > 0 ? (
        <span className="text-xs text-muted-foreground">+{rest.length}</span>
      ) : null}
    </span>
  );
}

/**
 * A variable product has no single price - `pricing` carries the span across
 * its variants, and `sellingPrice` is absent - so the range is the honest
 * thing to show.
 */
function PriceCell({ product }: { product: AdminProductRow }) {
  const { min, max } = product.pricing;

  return (
    <>
      <span>{formatPriceRange(min, max, product.currency)}</span>
      {product.originalPrice && product.originalPrice > min ? (
        <span className="ml-1.5 text-xs text-muted-foreground line-through">
          {formatPrice(product.originalPrice, product.currency)}
        </span>
      ) : null}
    </>
  );
}

function StockCell({ product }: { product: AdminProductRow }) {
  const stock = product.stock;

  // Not every product tracks inventory, and "0" would be a lie for one that
  // does not - it means unlimited, not sold out.
  if (!stock || stock.trackInventory === false) {
    return (
      <Badge variant="outline" className="font-normal">
        Not tracked
      </Badge>
    );
  }

  const quantity = stock.quantity ?? 0;
  const low = stock.lowStockThreshold ?? 0;

  if (quantity <= 0) {
    return (
      <Badge className="bg-destructive/12 font-normal text-destructive">
        {stock.allowBackorder ? "Backorder" : "Out of stock"}
      </Badge>
    );
  }

  return (
    <Badge
      className={cn(
        "font-normal tabular-nums",
        quantity <= low
          ? "bg-warning/15 text-warning-foreground dark:text-warning"
          : "bg-success/12 text-success",
      )}
    >
      {quantity} in stock
    </Badge>
  );
}
