/**
 * What a staff correction to an order may contain.
 *
 * **The same fields the checkout collects**, and the same rules - this reuses
 * `fullNameSchema` and `checkoutPhoneSchema` rather than restating them, and
 * repeats the checkout's district rule verbatim. A value a customer could not
 * have entered is not one staff can enter either.
 *
 * The fields the checkout does not render are absent here too: `line2`,
 * `area`, `postalCode` and `country` are all accepted by the API and none of
 * them is ever typed by anyone, so a form offering them would be inventing
 * work. They are left untouched on the record - `PATCH /admin/orders/:id`
 * merges the address rather than replacing it, so anything an order already
 * carries survives an edit that never mentions it.
 *
 * What is absent from the endpoint itself is the point of it: no price, no
 * quantity, no line item, no status. Correcting a mistyped house number is
 * routine; changing what an order costs after the customer agreed to it is not
 * something this API does at all.
 */

import { z } from "zod";

import { fullNameSchema } from "@/lib/auth/schemas";
import { isKnownDistrict } from "@/lib/checkout/bangladesh";
import { checkoutPhoneSchema } from "@/lib/checkout/schema";

/** `ORDER.MAX_NOTE_LENGTH` in the API's constants. */
export const MAX_NOTE_LENGTH = 1000;

export const orderDetailsSchema = z.object({
  name: fullNameSchema,
  /*
   * Holds the local 11 digits behind a fixed `+88`, exactly as the checkout
   * control does, and rejoins them on the way out - so a saved number comes
   * back in the `+8801602817341` shape the order was stored with rather than
   * in whatever format staff happened to type.
   */
  phone: checkoutPhoneSchema,

  line1: z
    .string()
    .trim()
    .min(1, "Street address is required")
    .max(240, "Address is too long"),

  /*
   * Checked against the real list, as at checkout: it decides the delivery
   * zone, and a typo would file the order in a district that does not exist.
   */
  district: z
    .string()
    .trim()
    .min(1, "District is required")
    .refine(isKnownDistrict, "Choose a district from the list"),

  city: z.string().trim().min(1, "City is required").max(120, "City is too long"),

  note: z
    .string()
    .trim()
    .max(MAX_NOTE_LENGTH, `Must be at most ${MAX_NOTE_LENGTH} characters`),
});

/** What the controls hold - `phone` is the bare local digits here. */
export type OrderDetailsValues = z.input<typeof orderDetailsSchema>;

/** What a valid submit produces - `phone` has been rejoined to `+88…`. */
export type OrderDetailsData = z.output<typeof orderDetailsSchema>;
