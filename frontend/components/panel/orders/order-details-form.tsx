"use client";

/**
 * Correcting where a parcel goes.
 *
 * **The checkout form, minus the parts that only make sense once.** Same
 * fields, same controls, same rules, same two sections in the same order - so
 * a correction is made against exactly what the customer filled in, and staff
 * who have seen the storefront already know this screen.
 *
 * What the checkout has that this cannot: the items, obviously, and the email
 * and create-an-account pair, which belong to placing an order rather than
 * amending one. `PATCH /admin/orders/:id` is `.strict()` with three keys -
 * `contact`, `shippingAddress`, `note` - so an email or a payment method here
 * would be a 422 rather than an ignored field.
 *
 * It sends only what changed. The API merges address fields rather than
 * replacing them, so a one-field fix stays a one-field request and anything
 * the order carries that this form never shows - a `line2`, a `postalCode` -
 * survives untouched.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";

import { cn } from "@/lib/utils";
import {
  isFinalStatus,
  type AdminOrder,
  type UpdateOrderDetailsPayload,
} from "@/lib/api/admin/orders";
import {
  orderDetailsSchema,
  type OrderDetailsData,
  type OrderDetailsValues,
} from "@/lib/panel/order-schema";
import { DISTRICT_NAMES } from "@/lib/checkout/bangladesh";
import {
  AuthInput,
  CONTROL,
  normaliseMobile,
  PhoneField,
} from "@/components/auth/controls";
import { SearchableSelect } from "@/components/checkout/searchable-select";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { orderStatusLabel } from "./order-status-badge";

function valuesOf(order: AdminOrder): OrderDetailsValues {
  return {
    name: order.contact.name,
    // `+8801602817341` -> `01602817341`, which is what the control holds.
    phone: normaliseMobile(order.contact.phone),
    line1: order.shippingAddress.line1 ?? "",
    district: order.shippingAddress.district ?? "",
    city: order.shippingAddress.city ?? "",
    note: order.note ?? "",
  };
}

/**
 * Only the fields that actually differ.
 *
 * Returns `null` when nothing does, which is both what the API demands ("Send
 * at least one field to update") and what stops a save that changes nothing
 * from writing `updatedBy` and looking, in the audit trail, like someone
 * touched the order.
 */
function buildPatch(
  values: OrderDetailsData,
  order: AdminOrder,
): UpdateOrderDetailsPayload | null {
  const before = valuesOf(order);
  const patch: UpdateOrderDetailsPayload = {};

  const contact: { name?: string; phone?: string } = {};
  if (values.name !== before.name) contact.name = values.name;
  /*
   * Compared as local digits, not as the rejoined `+88…` string. A number
   * stored as `+880 1602-817341` normalises to the same eleven digits, and
   * comparing the formatted forms would send a "change" that only rewrites the
   * punctuation - stamping `updatedBy` and making the audit trail say someone
   * edited an order they merely opened.
   */
  if (normaliseMobile(values.phone) !== before.phone) {
    contact.phone = values.phone;
  }
  if (Object.keys(contact).length > 0) patch.contact = contact;

  const address: Record<string, string> = {};
  if (values.line1 !== before.line1) address.line1 = values.line1;
  if (values.district !== before.district) address.district = values.district;
  if (values.city !== before.city) address.city = values.city;
  if (Object.keys(address).length > 0) patch.shippingAddress = address;

  // `null` clears the customer's delivery instruction; `undefined` would leave
  // it alone, which is not what emptying the box means.
  if (values.note !== before.note) patch.note = values.note || null;

  return Object.keys(patch).length > 0 ? patch : null;
}

export function OrderDetailsForm({
  order,
  saving,
  onSave,
  onCancel,
}: {
  order: AdminOrder;
  saving: boolean;
  onSave: (patch: UpdateOrderDetailsPayload) => void;
  onCancel: () => void;
}) {
  const form = useForm<OrderDetailsValues, unknown, OrderDetailsData>({
    resolver: zodResolver(orderDetailsSchema),
    defaultValues: valuesOf(order),
    // Matches the checkout form: nothing is inserted on blur, so a click that
    // lands while a message appears is never swallowed.
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const {
    control,
    register,
    setValue,
    handleSubmit,
    formState: { errors },
  } = form;

  /*
   * `useWatch`, not `watch()` - the latter returns a fresh function each
   * render, which makes React Compiler skip optimising the component.
   */
  const district = useWatch({ control, name: "district" }) ?? "";

  if (isFinalStatus(order.status)) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-4 text-sm leading-relaxed text-muted-foreground">
        This order is {orderStatusLabel(order.status).toLowerCase()} — its
        delivery details are now a record of what happened, and the API will not
        edit them.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={handleSubmit((values) => {
        const patch = buildPatch(values, order);
        // Nothing differs: the API would answer "Send at least one field to
        // update", so there is nothing to send.
        if (patch) onSave(patch);
        else onCancel();
      })}
    >
      <Section title="Contact details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="order-name">
              Full name
              <Required />
            </FieldLabel>
            <AuthInput
              id="order-name"
              aria-required
              placeholder="e.g. Raju Ahmed"
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
              {...register("name")}
            />
            <FieldError errors={[errors.name]} />
          </Field>

          <Field data-invalid={Boolean(errors.phone)}>
            <FieldLabel htmlFor="order-phone">
              Mobile number
              <Required />
            </FieldLabel>
            <PhoneField
              id="order-phone"
              aria-required
              aria-invalid={Boolean(errors.phone)}
              {...register("phone")}
            />
            <FieldDescription>
              The rider calls this before delivering.
            </FieldDescription>
            <FieldError errors={[errors.phone]} />
          </Field>
        </div>
      </Section>

      <Section title="Delivery address">
        <div className="grid gap-4">
          <Field data-invalid={Boolean(errors.line1)}>
            <FieldLabel htmlFor="order-line1">
              Street address
              <Required />
            </FieldLabel>
            <AuthInput
              id="order-line1"
              aria-required
              placeholder="e.g. House 42, Road 3, Dhanmondi"
              autoComplete="address-line1"
              aria-invalid={Boolean(errors.line1)}
              {...register("line1")}
            />
            <FieldError errors={[errors.line1]} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.district)}>
              <FieldLabel htmlFor="order-district">
                District
                <Required />
              </FieldLabel>
              <SearchableSelect
                id="order-district"
                aria-required
                items={DISTRICT_NAMES}
                value={district}
                placeholder="Search districts…"
                emptyMessage="No district matches"
                invalid={Boolean(errors.district)}
                onValueChange={(next) =>
                  setValue("district", next, { shouldValidate: true })
                }
              />
              {/*
                * The district sets the delivery charge at checkout, but
                * changing it here does not re-price the order - deliberately,
                * on the API's side. The total is what the customer agreed to
                * pay, and a typo fix must not change what the courier collects
                * at the door.
                */}
              <FieldDescription>Does not re-price the order.</FieldDescription>
              <FieldError errors={[errors.district]} />
            </Field>

            <Field data-invalid={Boolean(errors.city)}>
              <FieldLabel htmlFor="order-city">
                City / town
                <Required />
              </FieldLabel>
              <AuthInput
                id="order-city"
                aria-required
                placeholder="e.g. Savar"
                autoComplete="address-level2"
                aria-invalid={Boolean(errors.city)}
                {...register("city")}
              />
              <FieldError errors={[errors.city]} />
            </Field>
          </div>

          <Field data-invalid={Boolean(errors.note)}>
            <FieldLabel htmlFor="order-note">Delivery note</FieldLabel>
            <Textarea
              id="order-note"
              rows={3}
              placeholder="e.g. Please call before delivery"
              aria-invalid={Boolean(errors.note)}
              className={cn(CONTROL, "h-auto py-2.5")}
              {...register("note")}
            />
            <FieldError errors={[errors.note]} />
          </Field>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={saving}
          className="h-10 cursor-pointer rounded-lg px-4 text-sm"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={saving}
          className="h-10 cursor-pointer gap-2 rounded-lg px-4 text-sm font-semibold"
        >
          {saving ? <Spinner className="size-4" /> : null}
          Save changes
        </Button>
      </div>
    </form>
  );
}

/**
 * The asterisk on a required label.
 *
 * `aria-hidden` because the mark is a visual convention, not something worth
 * reading out as "star" - the control itself carries `aria-required`, which is
 * what a screen reader announces instead.
 */
function Required() {
  return (
    <span aria-hidden className="ml-0.5 text-destructive">
      *
    </span>
  );
}

/** Flatter than the checkout's card - this already sits inside one. */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
