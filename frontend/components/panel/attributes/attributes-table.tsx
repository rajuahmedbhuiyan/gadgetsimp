"use client";

import { Braces, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AttributePermissions } from "@/lib/panel/permissions";
import type { AdminAttribute } from "@/lib/api/admin/attributes";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AttributeSourceBadge,
  AttributeTypeBadge,
  CatalogStatusBadge,
} from "./attribute-badges";

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

export function AttributesTable({
  attributes,
  permissions,
  busy,
  onEdit,
  onDelete,
}: {
  attributes: AdminAttribute[];
  permissions: AttributePermissions;
  busy: boolean;
  onEdit: (attribute: AdminAttribute) => void;
  onDelete: (attribute: AdminAttribute) => void;
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
        <Table className="min-w-[1100px]">
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow className="bg-muted hover:bg-muted">
              <TableHead className="pl-4">Attribute</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Range</TableHead>
              <TableHead>Display</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-24 pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attributes.map((attribute) => (
              <TableRow key={attribute.id}>
                <TableCell className="pl-4">
                  <AttributeIdentity attribute={attribute} />
                </TableCell>
                <TableCell>
                  <AttributeSourceBadge source={attribute.source} />
                </TableCell>
                <TableCell>
                  <AttributeTypeBadge type={attribute.type} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {attribute.type === "range"
                    ? `${attribute.min ?? "-"} - ${attribute.max ?? "-"}`
                    : "Not used"}
                </TableCell>
                <TableCell>
                  <DisplayState attribute={attribute} />
                </TableCell>
                <TableCell>
                  <CatalogStatusBadge status={attribute.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {dateTime(attribute.updatedAt)}
                </TableCell>
                <TableCell className="pr-4">
                  <RowActions
                    attribute={attribute}
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
        {attributes.map((attribute) => (
          <article key={attribute.id} className="min-w-0 max-w-full overflow-hidden rounded-xl border bg-card p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <AttributeIdentity attribute={attribute} />
              <RowActions
                attribute={attribute}
                permissions={permissions}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
            {attribute.description ? (
              <p className="mt-3 line-clamp-3 min-w-0 break-words text-sm leading-relaxed text-muted-foreground">
                {attribute.description}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <AttributeSourceBadge source={attribute.source} />
              <AttributeTypeBadge type={attribute.type} />
              <CatalogStatusBadge status={attribute.status} />
            </div>
            <dl className="mt-3 grid min-w-0 grid-cols-2 gap-3 text-xs">
              <div className="min-w-0">
                <dt className="text-muted-foreground">Range</dt>
                <dd className="mt-0.5 truncate font-medium">
                  {attribute.type === "range"
                    ? `${attribute.min ?? "-"} - ${attribute.max ?? "-"}`
                    : "Not used"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Updated</dt>
                <dd className="mt-0.5 truncate font-medium">{dateTime(attribute.updatedAt)}</dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-muted-foreground">Display</dt>
                <dd className="mt-0.5 min-w-0 font-medium">
                  <DisplayState attribute={attribute} />
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

function AttributeIdentity({ attribute }: { attribute: AdminAttribute }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground">
        <Braces className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate font-semibold">{attribute.name}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {attribute.key} / {attribute.slug}
        </p>
      </div>
    </div>
  );
}

function DisplayState({ attribute }: { attribute: AdminAttribute }) {
  const shown = attribute.display?.showInProductDetails ?? true;

  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {shown ? (
        <Eye className="size-3.5" aria-hidden />
      ) : (
        <EyeOff className="size-3.5" aria-hidden />
      )}
      <span className="truncate">{shown ? "Product details" : "Hidden in details"}</span>
    </span>
  );
}

function RowActions({
  attribute,
  permissions,
  onEdit,
  onDelete,
}: {
  attribute: AdminAttribute;
  permissions: AttributePermissions;
  onEdit: (attribute: AdminAttribute) => void;
  onDelete: (attribute: AdminAttribute) => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-1">
      {permissions.edit ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit ${attribute.name}`}
          onClick={() => onEdit(attribute)}
          className="size-9 cursor-pointer rounded-lg"
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
      ) : null}

      {permissions.remove ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Archive ${attribute.name}`}
          onClick={() => onDelete(attribute)}
          className="size-9 cursor-pointer rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
