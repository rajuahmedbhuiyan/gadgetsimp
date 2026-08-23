"use client";

/**
 * The two ways an order can be removed, and why they do not share a dialog.
 *
 * The API keeps them on separate routes rather than behind a flag, on the
 * grounds that a destructive operation should be something you ask for by
 * name. Collapsing them back into one prompt with a checkbox would undo
 * exactly that, so they are two prompts that read differently on purpose.
 *
 * Both are admin-and-above (`authorize(ROLES.ADMIN)` on each delete route), so
 * neither is rendered for a moderator - see `orderPermissions`.
 */

import { useState } from "react";

import type { AdminOrder } from "@/lib/api/admin/orders";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/** Soft delete: reversible in the sense that matters - the record survives. */
export function SoftDeleteDialog({
  order,
  onConfirm,
  onClose,
}: {
  order: AdminOrder | null;
  onConfirm: (order: AdminOrder) => void;
  onClose: () => void;
}) {
  return (
    <AlertDialog
      open={order !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete order #{order?.orderNumber}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            It disappears from this list and from every listing, but the record
            is kept rather than destroyed — an order is what a refund, a tax
            return and a dispute are argued from. Any units still reserved for
            it go back on the shelf.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer rounded-lg">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => order && onConfirm(order)}
            className="cursor-pointer rounded-lg bg-destructive text-white hover:bg-destructive/90"
          >
            Delete order
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Hard delete.
 *
 * The order number has to be typed. Not ceremony: this is the one call in the
 * panel with nothing behind it - no archive, no restore, no row left to
 * reconcile a refund against - and it is reached from the same menu as "view
 * details". A confirm button alone is one mis-aimed click away from that.
 */
export function HardDeleteDialog({
  order,
  onConfirm,
  onClose,
}: {
  order: AdminOrder | null;
  onConfirm: (order: AdminOrder) => void;
  onClose: () => void;
}) {
  return (
    <AlertDialog
      open={order !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialogContent>
        {/* Keyed so a half-typed number never carries into the next order. */}
        {order ? (
          <HardDeleteBody
            key={order.id}
            order={order}
            onConfirm={onConfirm}
            onClose={onClose}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function HardDeleteBody({
  order,
  onConfirm,
  onClose,
}: {
  order: AdminOrder;
  onConfirm: (order: AdminOrder) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === order.orderNumber;

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          Permanently delete #{order.orderNumber}?
        </AlertDialogTitle>
        <AlertDialogDescription>
          This destroys the record of a{" "}
          {formatPrice(order.total, order.currency)} sale to{" "}
          {order.contact.name}. There is no archive behind it and nothing left
          to argue a refund, a courier claim or a tax return from. Any units
          still reserved are released first.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-order-number" className="text-sm">
          Type <strong className="tabular-nums">{order.orderNumber}</strong> to
          confirm
        </Label>
        <Input
          id="confirm-order-number"
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={order.orderNumber}
          className="h-10 rounded-lg text-sm tabular-nums"
        />
      </div>

      <AlertDialogFooter>
        <Button
          variant="ghost"
          onClick={onClose}
          className="h-10 cursor-pointer rounded-lg px-4 text-sm"
        >
          Cancel
        </Button>
        <Button
          disabled={!matches}
          onClick={() => onConfirm(order)}
          className="h-10 cursor-pointer rounded-lg bg-destructive px-4 text-sm font-semibold text-white hover:bg-destructive/90"
        >
          Delete forever
        </Button>
      </AlertDialogFooter>
    </>
  );
}
