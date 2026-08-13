/**
 * Client-side mirrors of the server's request schemas
 * (`backend/src/modules/auth/auth.validation.js`).
 *
 * The server validates everything again - this is only here so a typo is
 * caught before it costs a round trip and, on the throttled endpoints, a slot
 * from a rate-limit budget.
 */

import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/\d/, "Password must contain a number");

/** Trim first, then validate: the server trims too, so " a@b.com " is fine. */
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .pipe(z.email("Enter a valid email address").max(160, "Email is too long"));

/**
 * One name field. There is no first/last pair anywhere in this API, and a
 * single word is a valid name.
 */
export const fullNameSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(120, "Must be at most 120 characters")
  .regex(/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u, "Enter a valid name");

/**
 * A Bangladeshi mobile, entered as the local 11 digits (`01602817341`).
 *
 * The control shows a fixed `+88` prefix and holds only the digits, so this is
 * what rejoins them into the `+8801602817341` the API stores. Optional in the
 * API, so an empty control has to become an absent key rather than `""` -
 * every request schema is strict and would 422 on the empty string.
 */
export const bdMobileSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^01\d{9}$/.test(value),
    "Enter an 11-digit number starting with 01",
  )
  .transform((value) => (value === "" ? undefined : `+88${value}`));

const confirmField = z.string().min(1, "Confirm your password");

export const loginSchema = z.object({
  email: emailSchema,
  // Deliberately not `passwordSchema`: an account created before a rule
  // changed must still be able to sign in. The server decides.
  password: z.string().min(1, "Required"),
});

export const registerSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    phone: bdMobileSchema,
    password: passwordSchema,
    confirmPassword: confirmField,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const emailOnlySchema = z.object({ email: emailSchema });

export const setPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: confirmField,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const resetPasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: confirmField,
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: passwordSchema,
    confirmPassword: confirmField,
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/**
 * `*Values` is what the controls hold, `*Data` is what comes out of the
 * resolver - they differ wherever a schema transforms, which is why forms are
 * typed with both.
 */
export type LoginValues = z.input<typeof loginSchema>;
export type LoginData = z.output<typeof loginSchema>;

export type RegisterValues = z.input<typeof registerSchema>;
export type RegisterData = z.output<typeof registerSchema>;

export type EmailOnlyValues = z.input<typeof emailOnlySchema>;
export type EmailOnlyData = z.output<typeof emailOnlySchema>;

export type SetPasswordValues = z.input<typeof setPasswordSchema>;
export type SetPasswordData = z.output<typeof setPasswordSchema>;

export type ResetPasswordValues = z.input<typeof resetPasswordSchema>;
export type ResetPasswordData = z.output<typeof resetPasswordSchema>;

export type ChangePasswordValues = z.input<typeof changePasswordSchema>;
export type ChangePasswordData = z.output<typeof changePasswordSchema>;
