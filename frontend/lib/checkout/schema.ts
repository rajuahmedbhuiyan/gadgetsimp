/**
 * What the checkout form accepts, mirroring the server's own schema.
 *
 * The API requires four: `name`, `phone`, `line1` and `city`. This form
 * requires one more - `district` - because it decides the delivery quote, and
 * a rider cannot be dispatched to a city name alone.
 *
 * `area` and `postalCode` are gone. `upazila` is defined but optional and its
 * picker is commented out for now.
 */

import { z } from "zod";

import { emailSchema, fullNameSchema } from "@/lib/auth/schemas";
import { isKnownDistrict, upazilasFor } from "./bangladesh";

/**
 * The phone, entered as the local 11 digits behind a fixed `+88`.
 *
 * Required here, unlike on registration - this is the number the rider calls,
 * so an order without one cannot be completed.
 */
export const checkoutPhoneSchema = z
  .string()
  .trim()
  .min(1, "A phone number is required for delivery")
  .refine(
    (value) => /^01\d{9}$/.test(value),
    "Enter an 11-digit number starting with 01",
  )
  .transform((value) => `+88${value}`);

/** Trims, and turns an untouched control into an absent key rather than "". */
function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} is too long`)
    .transform((value) => (value === "" ? undefined : value));
}

export const checkoutSchema = z
  .object({
    fullName: fullNameSchema,
    phone: checkoutPhoneSchema,

    line1: z
      .string()
      .trim()
      .min(1, "Street address is required")
      .max(240, "Address is too long"),
    line2: optionalText(240, "Address"),
    city: z
      .string()
      .trim()
      .min(1, "City is required")
      .max(120, "City is too long"),

    /*
     * Checked against the real list rather than just "not empty": it drives
     * the delivery quote, and a typo would otherwise price the order as if it
     * were outside Dhaka.
     */
    district: z
      .string()
      .trim()
      .min(1, "District is required")
      .refine(isKnownDistrict, "Choose a district from the list"),

    /*
     * Optional, and its picker is currently commented out of the form.
     * Kept in the schema because the validation below already knows how to
     * check it against its district - re-enabling it is uncommenting one
     * block, not rebuilding the rule.
     */
    upazila: z
      .string()
      .trim()
      .transform((value) => (value === "" ? undefined : value)),

    note: optionalText(1000, "Note"),

    /* Guest-only. Ignored by the API for a signed-in caller. */
    email: z
      .string()
      .trim()
      .transform((value) => (value === "" ? undefined : value)),
    createAccount: z.boolean(),
  })
  /*
   * `createAccount` needs somewhere to send the verification message, so the
   * email stops being optional the moment the box is ticked. Checked here
   * rather than on the field so the error lands on the control the shopper
   * just interacted with.
   */
  .superRefine((data, ctx) => {
    // The upazila list depends on the district, so the pair is validated
    // together - "Savar" is valid under Dhaka and nonsense under Sylhet.
    if (data.district && data.upazila) {
      const allowed = upazilasFor(data.district);
      if (allowed.length > 0 && !allowed.includes(data.upazila)) {
        ctx.addIssue({
          code: "custom",
          path: ["upazila"],
          message: `Choose an upazila in ${data.district}`,
        });
      }
    }

    if (!data.email) {
      if (data.createAccount) {
        ctx.addIssue({
          code: "custom",
          path: ["email"],
          message: "An email is needed to create your account",
        });
      }
      return;
    }

    const parsed = emailSchema.safeParse(data.email);
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Enter a valid email address",
      });
    }
  });

export type CheckoutValues = z.input<typeof checkoutSchema>;
export type CheckoutData = z.output<typeof checkoutSchema>;
