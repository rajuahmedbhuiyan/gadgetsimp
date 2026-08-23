"use client";

/**
 * Moving an order to its next status.
 *
 * The note is not paperwork. The API demands one for RETURNED and CANCELED
 * (`ORDER_STATUS_NOTE_REQUIRED`) because those are the two outcomes anyone
 * ever looks back at - during a refund dispute, a courier claim, or an
 * argument about who cancelled - and the bare word answers none of those
 * questions. Asking here rather than round-tripping to be told is the only
 * difference this dialog makes to the rule.
 *
 * It also says what the move will *do*, because two of these transitions have
 * consequences beyond the label: ending an order puts its reserved units back
 * on the shelf, and delivering a cash-on-delivery order is what marks it paid.
 */

import { useState } from "react";

import {
  requiresNote,
  type AdminOrder,
  type OrderStatusName,
} from "@/lib/api/admin/orders";
import { MAX_NOTE_LENGTH } from "@/lib/panel/order-schema";
import { statusMeta } from "@/lib/orders/status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { orderStatusLabel } from "./order-status-badge";

export interface PendingStatusChange {
  order: AdminOrder;
  status: OrderStatusName;
}

/** What else the move does, in the words of whoever has to explain it later. */
function consequence(status: OrderStatusName): string | null {
  if (status === "CANCELED" || status === "RETURNED") {
    return "The units reserved for this order go back on the shelf.";
  }
  if (status === "DELIVERED") {
    return "Cash on delivery is settled at the door, so this also marks the payment paid.";
  }
  return null;
}

export function OrderStatusDialog({
  pending,
  saving,
  onConfirm,
  onClose,
}: {
  pending: PendingStatusChange | null;
  saving: boolean;
  onConfirm: (note: string) => void;
  onClose: () => void;
}) {
  if (!pending) return null;

  return (
    /*
     * Keyed by the move, not just the order: a reason typed for a cancellation
     * must not still be sitting in the box when the next order is marked
     * returned. A remount is a cheaper and less forgettable reset than
     * clearing it in an effect.
     */
    <Prompt
      key={`${pending.order.id}-${pending.status}`}
      pending={pending}
      saving={saving}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

function Prompt({
  pending,
  saving,
  onConfirm,
  onClose,
}: {
  pending: PendingStatusChange;
  saving: boolean;
  onConfirm: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const { order, status } = pending;
  const Icon = statusMeta(status).icon;
  const noteRequired = requiresNote(status);
  const missing = noteRequired && note.trim().length === 0;
  const extra = consequence(status);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-4.5 shrink-0" aria-hidden />
            Mark #{order.orderNumber} {orderStatusLabel(status).toLowerCase()}?
          </DialogTitle>
          <DialogDescription>
            {statusMeta(status).description}
            {extra ? ` ${extra}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="status-note" className="text-sm font-medium">
            Note{" "}
            <span className="font-normal text-muted-foreground">
              {noteRequired ? "(required)" : "(optional)"}
            </span>
          </Label>
          <Textarea
            id="status-note"
            rows={3}
            autoFocus
            value={note}
            maxLength={MAX_NOTE_LENGTH}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && missing}
            placeholder={
              noteRequired
                ? `Why was this order ${orderStatusLabel(status).toLowerCase()}?`
                : "Anything worth recording against this change."
            }
            className="rounded-lg text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {noteRequired
              ? "Kept on the order's history, and read back during disputes."
              : "Appended to the order's status history."}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="h-10 cursor-pointer rounded-lg px-4 text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTouched(true);
              if (!missing) onConfirm(note.trim());
            }}
            disabled={saving || missing}
            className="h-10 cursor-pointer gap-2 rounded-lg px-4 text-sm font-semibold"
          >
            {saving ? <Spinner className="size-4" /> : null}
            Mark {orderStatusLabel(status).toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
