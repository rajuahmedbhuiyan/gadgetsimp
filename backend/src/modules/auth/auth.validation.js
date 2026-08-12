"use strict";

const { z } = require("zod");
const { SOCIAL_PROVIDERS } = require("../../shared/constants");

/**
 * Note what is absent: `role`. The registration schema is `.strict()`, so
 * `{"email":"...","role":"ROLE_ADMIN"}` is rejected outright rather than
 * silently dropped. Privilege escalation is prevented by the schema rather
 * than by remembering to blacklist a field in the service.
 */

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/\d/, "Password must contain a number");

const emailSchema = z
  .email("Enter a valid email address")
  .max(160)
  .trim()
  .toLowerCase();

// Allows the letters, marks and joining characters real names actually use -
// accents, apostrophes, hyphens - while excluding digits and punctuation that
// only ever show up in junk signups.
const nameSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(60, "Must be at most 60 characters")
  .regex(/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u, "Enter a valid name");

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d\s-]{7,20}$/, "Enter a valid phone number");

const register = {
  body: z
    .object({
      firstName: nameSchema,
      lastName: nameSchema,
      email: emailSchema,
      password: passwordSchema,
      phone: phoneSchema.optional(),
    })
    .strict(),
};

const verifyEmail = {
  body: z
    .object({
      token: z.string().trim().min(20, "Invalid verification token").max(256),
    })
    .strict(),
};

const resendVerification = {
  body: z.object({ email: emailSchema }).strict(),
};

const socialLogin = {
  body: z
    .object({
      type: z.enum(SOCIAL_PROVIDERS),
      /**
       * The credential from the provider's browser SDK. What it *is* differs
       * by provider - an opaque access token from `FB.login()`, a signed ID
       * token (`credential`) from Google Identity Services - which is why the
       * field is named neutrally. Either way it is verified server-side and
       * never trusted as presented.
       *
       * The generous max accommodates Google ID tokens, which are JWTs
       * carrying the whole profile and run well past 1KB.
       */
      token: z.string().trim().min(20, "Invalid token").max(4096),
    })
    .strict(),
};

const login = {
  body: z
    .object({
      email: emailSchema,
      password: z.string().min(1, "Password is required").max(128),
    })
    .strict(),
};

const changePassword = {
  body: z
    .object({
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword: passwordSchema,
    })
    .strict()
    .refine((data) => data.currentPassword !== data.newPassword, {
      message: "New password must be different from the current password",
      path: ["newPassword"],
    }),
};

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  socialLogin,
  login,
  changePassword,
  passwordSchema,
  emailSchema,
  nameSchema,
  phoneSchema,
};
