"use client";

/**
 * One order, in full, with the controls that change it.
 *
 * A side sheet rather than its own route: working a queue is a sequence of
 * "open it, decide, move on", and a page navigation loses the filtered list
 * and the scroll position each time.
 *
 * Six sections, each its own card and each collapsible. Delivery and Items
 * open by default because they are what an order *is* - where it goes and what
 * is in it - and everything below them is bookkeeping consulted only when
 * something has gone wrong. Folding those away is what keeps the two that
 * matter above the fold on a laptop.
 *
 * The read-only halves are the same blocks the expanded table row uses, so the
 * two can never disagree about a total or an address. What lives only here is
 * what changes the record: the edit form and the two deletes.
 *
 * It reads its order from the list rather than fetching again. `POST
 * /admin/orders/filter` already returns the full staff presentation, items,
 * history and all, so a second request by id would ask for what is on screen -
 * and because every mutation invalidates the listing, this re-renders itself
 * after a status change.
 */

import { useState } from "react";
import {
  Ban,
  ClipboardList,
  History,
  MapPin,
  Monitor,
  Package,
  Pencil,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatOrderDate } from "@/lib/orders/status";
import {
  isFinalStatus,
  type AdminOrder,
  type OrderStatusName,
  type UpdateOrderDetailsPayload,
} from "@/lib/api/admin/orders";
import type { OrderPermissions } from "@/lib/panel/permissions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { OrderDetailsForm } from "./order-details-form";
import {
  ClientFacts,
  DeliveryBlock,
  OrderFacts,
  OrderItems,
  OrderTotals,
  StatusHistory,
} from "./order-detail-panels";
import { ORDER_STATUS_LABEL } from "./order-status-badge";
import { OrderStatusMenu } from "./order-status-menu";

export function OrderSheet({
  order,
  permissions,
  savingDetails,
  onOpenChange,
  onChangeStatus,
  onSaveDetails,
  onSoftDelete,
  onHardDelete,
}: {
  order: AdminOrder | null;
  permissions: OrderPermissions;
  savingDetails: boolean;
  onOpenChange: (open: boolean) => void;
  onChangeStatus: (order: AdminOrder, status: OrderStatusName) => void;
  onSaveDetails: (order: AdminOrder, patch: UpdateOrderDetailsPayload) => void;
  onSoftDelete: (order: AdminOrder) => void;
  onHardDelete: (order: AdminOrder) => void;
}) {
  return (
    <Sheet open={order !== null} onOpenChange={onOpenChange}>
      {/* Wider than the default `sm:max-w-sm`: the record inside is two
          columns of tiles and a line-item list, and squeezing that into a
          phone-width column on a desktop wrapped every value onto its own
          row. */}
      <SheetContent className="overflow-y-auto w-[450px]! max-w-[100vw]!">
        {order ? (
          /*
           * Keyed by order, so moving to the next one remounts the body: its
           * open edit form and its expanded sections go with it. A half-typed
           * address surviving into someone else's order is the bug the key
           * makes unrepresentable.
           */
          <Body
            key={order.id}
            order={order}
            permissions={permissions}
            savingDetails={savingDetails}
            onChangeStatus={onChangeStatus}
            onSaveDetails={onSaveDetails}
            onSoftDelete={onSoftDelete}
            onHardDelete={onHardDelete}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  order,
  permissions,
  savingDetails,
  onChangeStatus,
  onSaveDetails,
  onSoftDelete,
  onHardDelete,
}: {
  order: AdminOrder;
  permissions: OrderPermissions;
  savingDetails: boolean;
  onChangeStatus: (order: AdminOrder, status: OrderStatusName) => void;
  onSaveDetails: (order: AdminOrder, patch: UpdateOrderDetailsPayload) => void;
  onSoftDelete: (order: AdminOrder) => void;
  onHardDelete: (order: AdminOrder) => void;
}) {
  const [editing, setEditing] = useState(false);
  const deleted = Boolean(order.deletedAt);
  const stuck =
    !deleted && permissions.changeStatus && isFinalStatus(order.status);
  const editable =
    permissions.edit && !deleted && !isFinalStatus(order.status);

  return (
    <>
      <SheetHeader className="gap-2 border-b p-4 pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <SheetTitle className="text-lg tabular-nums">
            #{order.orderNumber}
          </SheetTitle>
          <OrderStatusMenu
            order={order}
            permissions={permissions}
            onChangeStatus={onChangeStatus}
          />
          {deleted ? (
            <Badge variant="destructive" className="font-normal">
              Deleted
            </Badge>
          ) : null}
          {order.isGuestOrder ? (
            <Badge variant="outline" className="font-normal">
              Guest
            </Badge>
          ) : null}
        </div>
        <SheetDescription>
          Placed {formatOrderDate(order.placedAt)}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-3 p-4">
        {stuck ? (
          <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <Ban className="mt-px size-3.5 shrink-0" aria-hidden />
            {ORDER_STATUS_LABEL[order.status as OrderStatusName] ??
              order.status}{" "}
            is final — this order cannot move any further.
          </p>
        ) : null}

        <Accordion
          defaultValue={["delivery", "items"]}
          className="flex flex-col gap-3"
        >
          <Panel
            value="delivery"
            icon={MapPin}
            title="Delivery"
            hint={order.contact.name}
          >
            {editing ? (
              <OrderDetailsForm
                order={order}
                saving={savingDetails}
                onSave={(patch) => {
                  onSaveDetails(order, patch);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <DeliveryBlock order={order} />
                {/*
                  * Inside the panel rather than on the accordion trigger: a
                  * button nested in a button is invalid, and the trigger has
                  * to stay the whole clickable row.
                  */}
                {editable ? (
                  <Button
                    variant="outline"
                    onClick={() => setEditing(true)}
                    className="h-9 w-fit cursor-pointer gap-1.5 rounded-lg px-3 text-sm"
                  >
                    <Pencil className="size-4" aria-hidden />
                    Edit delivery details
                  </Button>
                ) : null}
              </div>
            )}
          </Panel>

          <Panel
            value="items"
            icon={Package}
            title="Items"
            hint={`${order.itemCount} line${order.itemCount === 1 ? "" : "s"}`}
          >
            <div className="flex flex-col gap-3">
              <OrderItems order={order} />
              <OrderTotals order={order} />
            </div>
          </Panel>

          <Panel
            value="history"
            icon={History}
            title="History"
            hint={`${order.statusHistory.length} change${
              order.statusHistory.length === 1 ? "" : "s"
            }`}
          >
            <StatusHistory order={order} />
          </Panel>

          <Panel value="record" icon={ClipboardList} title="Record">
            <OrderFacts order={order} />
          </Panel>

          {order.client ? (
            <Panel
              value="client"
              icon={Monitor}
              title="Placed from"
              hint={order.client.ip ?? undefined}
            >
              <ClientFacts order={order} />
            </Panel>
          ) : null}

          {permissions.remove || permissions.destroy ? (
            <Panel
              value="danger"
              icon={ShieldAlert}
              title="Danger zone"
              tone="danger"
            >
              <div className="flex flex-col gap-2.5">
                {permissions.remove && !deleted ? (
                  <DangerRow
                    label="Delete this order"
                    hint="Hides it from every listing and releases any reserved stock. The record and its numbers are kept."
                    action={
                      <Button
                        variant="outline"
                        onClick={() => onSoftDelete(order)}
                        className="h-9 shrink-0 cursor-pointer gap-1.5 rounded-lg px-3 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Delete
                      </Button>
                    }
                  />
                ) : null}

                {permissions.destroy ? (
                  <DangerRow
                    label="Delete permanently"
                    hint="Destroys the record. There is no archive behind this and nothing left to argue a refund or a tax return from."
                    action={
                      <Button
                        variant="outline"
                        onClick={() => onHardDelete(order)}
                        className="h-9 shrink-0 cursor-pointer gap-1.5 rounded-lg border-destructive/40 px-3 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Delete forever
                      </Button>
                    }
                  />
                ) : null}
              </div>
            </Panel>
          ) : null}
        </Accordion>
      </div>
    </>
  );
}

/* --------------------------------- pieces -------------------------------- */

/**
 * One collapsible card.
 *
 * The `hint` is what the section says when it is shut - a name, a count, an
 * address - so a folded panel still answers the question that would otherwise
 * make you open it.
 */
function Panel({
  value,
  icon: Icon,
  title,
  hint,
  tone,
  children,
}: {
  value: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  hint?: string;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <AccordionItem
      value={value}
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-xs",
        tone === "danger" && "border-destructive/30",
      )}
    >
      <AccordionTrigger className="cursor-pointer items-center gap-3 px-4 py-3.5 hover:no-underline">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          {/* The icon in a chip rather than loose against the text: it gives
              every head the same left edge, which is what lets six stacked
              panels read as one list instead of six unrelated boxes. */}
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl",
              tone === "danger"
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-4.5" aria-hidden />
          </span>

          <span className="grid min-w-0 flex-1 text-left">
            <span
              className={cn(
                "font-heading text-sm font-bold tracking-tight",
                tone === "danger" && "text-destructive",
              )}
            >
              {title}
            </span>
            {hint ? (
              <span className="truncate text-xs font-normal text-muted-foreground">
                {hint}
              </span>
            ) : null}
          </span>
        </span>
      </AccordionTrigger>

      <AccordionContent
        className={cn(
          "border-t bg-muted/25 px-4 pt-4 pb-4",
          tone === "danger" && "bg-destructive/5",
        )}
      >
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

function DangerRow({
  label,
  hint,
  action,
}: {
  label: string;
  hint: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      </div>
      {action}
    </div>
  );
}
