"use client";

/**
 * The checkout form.
 *
 * Three rules from the API shape most of this:
 *
 *  - **Never send a price.** The body carries products, quantities and an
 *    address; every figure on screen comes from the cart the server priced.
 *  - **One idempotency key per form, not per submit.** Generated once on
 *    mount, reused on every retry - a fresh key on the retry is exactly how
 *    duplicate cash-on-delivery orders get created.
 *  - **Retry the identical body.** The key is scoped to the caller, so a retry
 *    that drops `email` lands in a different scope and places a second order.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Loader2, Lock, ShieldCheck } from "lucide-react";

import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/lib/auth/auth-context";
import { isApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/auth/errors";
import {
  newIdempotencyKey,
  ordersApi,
  type PlaceOrderInput,
} from "@/lib/api/orders";
import { clearGuestCart } from "@/lib/cart/guest-cart";
import { saveConfirmation } from "@/lib/checkout/confirmation";
import {
  readCheckoutAddress,
  saveCheckoutAddress,
} from "@/lib/checkout/saved-address";
import {
  checkoutSchema,
  type CheckoutData,
  type CheckoutValues,
} from "@/lib/checkout/schema";
import { formatPrice } from "@/lib/format";
import {
  DEFAULT_DISTRICT,
  deliveryFeeFor,
  DISTRICT_NAMES,
} from "@/lib/checkout/bangladesh";
import {
  AUTH_BUTTON,
  AuthInput,
  normaliseMobile,
  PhoneField,
} from "@/components/auth/controls";
import { FormAlert } from "@/components/auth/form-alert";
import { SearchableSelect } from "./searchable-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export function CheckoutForm({
  onDistrictChange,
}: {
  /** Lets the summary beside the form quote a delivery fee. */
  onDistrictChange: (district: string) => void;
}) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { cart } = useCart();
  const [formError, setFormError] = useState<string | null>(null);

  /**
   * One key for the life of this form.
   *
   * Lazy `useState` rather than `useRef`: the value is read while building the
   * request, which the compiler treats as a render-path read of a ref. State
   * with an initialiser is generated exactly once, never set again, and is
   * legitimately readable anywhere.
   */
  const [idempotencyKey] = useState(newIdempotencyKey);

  const form = useForm<CheckoutValues, unknown, CheckoutData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      line1: "",
      line2: "",
      city: "",
      district: DEFAULT_DISTRICT,
      upazila: "",
      note: "",
      email: "",
      createAccount: false,
    },
    /*
     * `onSubmit`, not `onTouched`.
     *
     * Validating on blur inserts an error line under the field, which pushes
     * everything below it down - and when that happens between the mousedown
     * and mouseup of the click that caused the blur, the click is swallowed.
     * Reserving a blank line for the error avoided that but left a gap under
     * every input. Not validating on blur at all fixes both: nothing moves
     * while a click is in flight, and there is no empty space to reserve.
     * After the first submit, `reValidateMode` makes corrections live again.
     */
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const {
    control,
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = form;

  const district = useWatch({ control, name: "district" }) ?? "";
  const createAccount = useWatch({ control, name: "createAccount" }) ?? false;
  const deliveryFee = deliveryFeeFor(district);

  const savedAddressPrefilled = useRef(false);
  useEffect(() => {
    if (savedAddressPrefilled.current) return;
    savedAddressPrefilled.current = true;

    const saved = readCheckoutAddress();
    if (!saved) return;

    const current = getValues();
    if (saved.fullName && !current.fullName) setValue("fullName", saved.fullName);
    if (saved.phone && !current.phone) setValue("phone", normaliseMobile(saved.phone));
    if (saved.address.line1 && !current.line1) setValue("line1", saved.address.line1);
    if (saved.address.line2 && !current.line2) setValue("line2", saved.address.line2);
    if (saved.address.city && !current.city) setValue("city", saved.address.city);
    if (!current.district) {
      setValue("district", saved.address.district ?? DEFAULT_DISTRICT);
    }
    if (saved.address.area && !current.upazila) setValue("upazila", saved.address.area);

    if (saved.address.district) onDistrictChange(saved.address.district);
  }, [getValues, onDistrictChange, setValue]);

  /**
   * Prefill from the signed-in account.
   *
   * Only once, and only into fields the shopper has not typed in - `setValue`
   * without `shouldDirty` leaves their own edits alone on a re-render.
   */
  const prefilled = useRef(false);
  useEffect(() => {
    if (!user || prefilled.current) return;
    prefilled.current = true;

    if (user.fullName) setValue("fullName", user.fullName);
    if (user.phone) {
      /*
       * Stored as `+8801…`; the control holds the local 11 digits only.
       *
       * Through `normaliseMobile` rather than a local strip, because the
       * country code here is `88` and the number keeps its own leading zero -
       * taking `880` off `8801602817341` leaves `1602817341`, which is ten
       * digits, fails the test below, and silently prefills nothing.
       */
      const local = normaliseMobile(user.phone);
      if (/^01\d{9}$/.test(local)) setValue("phone", local);
    }
  }, [user, setValue]);

  async function onSubmit(values: CheckoutData) {
    setFormError(null);

    const payload: PlaceOrderInput = {
      items: cart.items
        // Unavailable lines are refused by the API anyway, and sending them
        // would fail the whole order rather than just that line.
        .filter((line) => line.availability.purchasable)
        .map((line) => ({
          productId: line.product.id,
          ...(line.variant ? { variantId: line.variant.id } : {}),
          quantity: line.quantity,
        })),
      contact: { name: values.fullName, phone: values.phone },
      shippingAddress: {
        line1: values.line1,
        ...(values.line2 ? { line2: values.line2 } : {}),
        // `area` carries the upazila when that picker is switched back on.
        ...(values.upazila ? { area: values.upazila } : {}),
        city: values.city,
        district: values.district,
        country: "Bangladesh",
      },
      ...(values.note ? { note: values.note } : {}),
      paymentMethod: "CASH_ON_DELIVERY",
      // Both ignored by the API for a signed-in caller, so they are only sent
      // for a guest - keeping the retried body byte-identical either way.
      ...(!isAuthenticated && values.email ? { email: values.email } : {}),
      ...(!isAuthenticated && values.createAccount
        ? { createAccount: true }
        : {}),
      idempotencyKey,
    };

    try {
      const response = await ordersApi.place(payload);

      saveCheckoutAddress({
        fullName: values.fullName,
        phone: values.phone,
        address: payload.shippingAddress,
      });

      saveConfirmation({
        order: response.data.order,
        accountInvite: response.data.accountInvite,
        // A retried key returns the original order rather than a second one.
        alreadyPlaced: response.code === "ORDER_ALREADY_PLACED",
      });

      // The server empties a signed-in cart itself; the local one is ours to
      // clear, and leaving it would show the just-ordered items again.
      if (!isAuthenticated) clearGuestCart();

      // `replace`, so Back does not return to a form whose cart is now empty.
      router.replace("/checkout/success");
    } catch (error) {
      // A 422 names the offending line, which is more use than the summary.
      const detail = isApiError(error) ? error.errors[0]?.message : undefined;
      setFormError(detail ?? errorMessage(error));

      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {formError ? <FormAlert message={formError} /> : null}

      <div className="flex flex-col gap-6">
        <Section title="Contact details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.fullName)}>
              <FieldLabel htmlFor="fullName">
                Full name
                <Required />
              </FieldLabel>
              <AuthInput
                id="fullName"
                aria-required
                placeholder="e.g. Raju Ahmed"
                autoComplete="name"
                aria-invalid={Boolean(errors.fullName)}
                {...register("fullName")}
              />
              <FieldError errors={[errors.fullName]} />
            </Field>

            <Field data-invalid={Boolean(errors.phone)}>
              <FieldLabel htmlFor="phone">
                Mobile number
                <Required />
              </FieldLabel>
              <PhoneField
                id="phone"
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
              <FieldLabel htmlFor="line1">
                Street address
                <Required />
              </FieldLabel>
              <AuthInput
                id="line1"
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
                <FieldLabel htmlFor="district">
                  District
                  <Required />
                </FieldLabel>
                <SearchableSelect
                  id="district"
                  aria-required
                  items={DISTRICT_NAMES}
                  value={district}
                  placeholder="Search districts…"
                  emptyMessage="No district matches"
                  invalid={Boolean(errors.district)}
                  onValueChange={(next) => {
                    setValue("district", next, { shouldValidate: true });
                    onDistrictChange(next);
                  }}
                />
                <FieldError errors={[errors.district]} />
              </Field>

              <Field data-invalid={Boolean(errors.city)}>
                <FieldLabel htmlFor="city">
                  City / town
                  <Required />
                </FieldLabel>
                <AuthInput
                  id="city"
                  aria-required
                  placeholder="e.g. Savar"
                  autoComplete="address-level2"
                  aria-invalid={Boolean(errors.city)}
                  {...register("city")}
                />
                <FieldError errors={[errors.city]} />
              </Field>
            </div>

            {/*
             * Upazila picker, parked for now.
             *
             * The data, the schema field and its district-aware validation are
             * all still in place - this is the only thing switched off, so
             * turning it back on is uncommenting this block and restoring the
             * `upazila`/`upazilas` watch above it.
             *
             * <Field data-invalid={Boolean(errors.upazila)}>
             *   <FieldLabel htmlFor="upazila">Upazila</FieldLabel>
             *   <SearchableSelect
             *     id="upazila"
             *     items={upazilasFor(district)}
             *     value={upazila}
             *     disabled={!district}
             *     placeholder="Search upazilas…"
             *     emptyMessage="No upazila matches"
             *     invalid={Boolean(errors.upazila)}
             *     onValueChange={(next) =>
             *       setValue("upazila", next, { shouldValidate: true })
             *     }
             *   />
             *   <FieldError errors={[errors.upazila]} />
             * </Field>
             */}

            <Field>
              <FieldLabel htmlFor="note">Delivery note</FieldLabel>
              <Textarea
                id="note"
                rows={3}
                placeholder="e.g. Please call before delivery"
                className="rounded-field"
                {...register("note")}
              />
              <FieldError errors={[errors.note]} />
            </Field>
          </div>
        </Section>

        {/* Guests only - the API ignores both fields for a signed-in caller,
            and a signed-in shopper already has an address on file. */}
        {!isAuthenticated ? (
          <Section title="Order updates">
            <Field data-invalid={Boolean(errors.email)}>
              <FieldLabel htmlFor="email">
                Email{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (optional)
                </span>
              </FieldLabel>
              <AuthInput
                id="email"
                type="email"
                inputMode="email"
                placeholder="you@example.com"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
              <FieldDescription>
                Where the receipt goes. The order is placed with or without it.
              </FieldDescription>
              <FieldError errors={[errors.email]} />
            </Field>

            <label className="flex cursor-pointer items-start gap-3 rounded-field border p-3.5 transition-colors hover:bg-muted/50">
              <Checkbox
                checked={createAccount}
                onCheckedChange={(checked) =>
                  setValue("createAccount", checked === true, {
                    shouldValidate: true,
                  })
                }
              />
              <span>
                <span className="block text-sm font-medium">
                  Create an account from this order
                </span>
                <span className="block text-xs text-muted-foreground">
                  We email a link to finish setting it up. Your order is placed
                  either way, and this order attaches to the new account.
                </span>
              </span>
            </label>
          </Section>
        ) : null}

        <Section title="Payment">
          <div className="flex items-start gap-3 rounded-field border-2 border-brand/40 bg-brand/8 p-4">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
              <ShieldCheck className="size-4.5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold">
                Cash on delivery
              </span>
              <span className="block text-xs text-muted-foreground">
                Pay the rider{" "}
                {formatPrice(
                  cart.summary.subtotal + (deliveryFee ?? 0),
                  cart.summary.currency,
                )}{" "}
                when your parcel arrives. No card needed.
              </span>
            </span>
          </div>
        </Section>

        <Button
          type="submit"
          className={AUTH_BUTTON}
          disabled={isSubmitting || !cart.summary.checkoutReady}
        >
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Lock className="size-4" aria-hidden />
          )}
          {isSubmitting ? "Placing your order…" : "Place order"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          By placing this order you agree to our terms and refund policy.
        </p>
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
