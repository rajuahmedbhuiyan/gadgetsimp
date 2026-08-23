"use client";

/**
 * The status badge, as the control that changes it.
 *
 * Clicking the thing that shows the state to change the state is the shortest
 * path there is, and it is where someone reaches first - the badge is what
 * they are already looking at when they decide the order has moved on.
 *
 * The moves are built from `ORDER_STATUS_FLOW`, so it can only ever offer one
 * the API will accept. An order with nowhere left to go renders as a plain
 * badge rather than a dead trigger: "this ended" is the message, not "you may
 * not".
 *
 * Two presentations. On a pointer it is a dropdown anchored to the badge. On a
 * phone it is a bottom sheet, because a menu pinned to a 24px badge in a
 * scrolling table is a target you aim at with a thumb and miss - and the miss
 * lands on whatever row the menu closed over. The sheet puts the same choices
 * where the thumb already is, at a size it cannot miss, and says which order
 * it is about.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { statusMeta } from "@/lib/orders/status";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  nextStatuses,
  type AdminOrder,
  type OrderStatusName,
} from "@/lib/api/admin/orders";
import type { OrderPermissions } from "@/lib/panel/permissions";
import { PanelMenuBackdrop } from "@/components/panel/menu-backdrop";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ORDER_STATUS_LABEL,
  OrderStatusBadge,
  orderStatusLabel,
} from "./order-status-badge";

const TRIGGER =
  "flex cursor-pointer rounded-full transition-opacity outline-none hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50";

export function OrderStatusMenu({
  order,
  permissions,
  onChangeStatus,
  align = "start",
}: {
  order: AdminOrder;
  permissions: OrderPermissions;
  onChangeStatus: (order: AdminOrder, status: OrderStatusName) => void;
  align?: "start" | "center" | "end";
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  /*
   * A deleted order is a record being read, not a queue item being worked -
   * the API filters status changes on `deletedAt: null`, so offering one would
   * only produce a 404.
   */
  const moves =
    permissions.changeStatus && !order.deletedAt ? nextStatuses(order.status) : [];

  if (moves.length === 0) return <OrderStatusBadge status={order.status} />;

  const label = `Change status of order ${order.orderNumber}`;

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          aria-label={label}
          onClick={() => setOpen(true)}
          className={TRIGGER}
        >
          <Trigger order={order} />
        </button>

        <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Move order #{order.orderNumber}</DrawerTitle>
              <DrawerDescription>
                Currently {orderStatusLabel(order.status).toLowerCase()}.
              </DrawerDescription>
            </DrawerHeader>

            <div className="flex flex-col gap-1.5 overflow-y-auto p-3 pb-8">
              {moves.map((status) => {
                const meta = statusMeta(status);
                const Icon = meta.icon;
                const negative = status === "CANCELED" || status === "RETURNED";

                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onChangeStatus(order, status);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors active:bg-muted",
                      negative
                        ? "border-destructive/30 text-destructive"
                        : "hover:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full",
                        negative
                          ? "bg-destructive/10"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-semibold">
                        {ORDER_STATUS_LABEL[status]}
                      </span>
                      {/* What the move does, not just what it is called - two
                          of these release stock and one settles the payment. */}
                      <span className="block text-sm text-muted-foreground">
                        {meta.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {open ? <PanelMenuBackdrop onClick={() => setOpen(false)} /> : null}
      <DropdownMenuTrigger
        render={<button type="button" aria-label={label} className={TRIGGER} />}
      >
        <Trigger order={order} />
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align} className="w-56">
        {/*
          * Wrapped in a Group because Base UI's `GroupLabel` reads its context
          * from one - a bare label throws "MenuGroupContext is missing".
          */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Move to
          </DropdownMenuLabel>
          {moves.map((status) => {
            const Icon = statusMeta(status).icon;
            const negative = status === "CANCELED" || status === "RETURNED";

            return (
              <DropdownMenuItem
                key={status}
                onClick={() => {
                  setOpen(false);
                  onChangeStatus(order, status);
                }}
                className={cn(
                  "cursor-pointer py-2 text-sm",
                  negative && "text-destructive data-highlighted:text-destructive",
                )}
              >
                <Icon aria-hidden />
                {ORDER_STATUS_LABEL[status]}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The badge plus its affordance, identical in both presentations. */
function Trigger({ order }: { order: AdminOrder }) {
  return (
    <OrderStatusBadge
      status={order.status}
      trailing={
        <ChevronDown className="-mr-0.5 size-4 shrink-0 opacity-70" aria-hidden />
      }
    />
  );
}
