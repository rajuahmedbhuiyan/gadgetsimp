"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";

import {
  AUTH_BUTTON,
  AuthInput,
  PasswordField,
  PasswordStrengthMeter,
  PhoneField,
} from "@/components/auth/controls";
import { FormAlert } from "@/components/auth/form-alert";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";
import { SocialSignIn } from "@/components/auth/social-sign-in";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useRedirectWhenAuthenticated } from "@/hooks/use-redirect-when-authenticated";
import { authApi } from "@/lib/api/auth";
import { errorMessage } from "@/lib/auth/errors";
import {
  registerSchema,
  type RegisterData,
  type RegisterValues,
} from "@/lib/auth/schemas";

export function RegisterForm() {
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // A social button on this page signs the user straight in.
  useRedirectWhenAuthenticated("/");

  const form = useForm<RegisterValues, unknown, RegisterData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  // Feeds the strength meter. Subscribing to the one field keeps the rest of
  // the form from re-rendering on every keystroke.
  const password = useWatch({ control, name: "password" }) ?? "";

  async function onSubmit(values: RegisterData) {
    setFormError(null);
    try {
      await authApi.register({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        phone: values.phone,
      });
      // 202: understood, not yet acted upon. No account, no session, no token.
      setPendingEmail(values.email);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  if (pendingEmail) return <CheckYourInbox email={pendingEmail} />;

  return (
    <div>
      {formError ? <FormAlert message={formError} /> : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.fullName)}>
            <FieldLabel htmlFor="fullName">Full name</FieldLabel>
            <AuthInput
              id="fullName"
              placeholder="Rahim Uddin"
              autoComplete="name"
              autoFocus
              aria-invalid={Boolean(errors.fullName)}
              {...register("fullName")}
            />
            <FieldError errors={[errors.fullName]} />
          </Field>

          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="register-email">Email</FieldLabel>
            <AuthInput
              id="register-email"
              type="email"
              inputMode="email"
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>

          <Field data-invalid={Boolean(errors.phone)}>
            <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
            <PhoneField
              id="phone"
              aria-invalid={Boolean(errors.phone)}
              {...register("phone")}
            />
            <FieldDescription>
              11 digits, starting with 01.
            </FieldDescription>
            <FieldError errors={[errors.phone]} />
          </Field>

          <Field data-invalid={Boolean(errors.password)}>
            <FieldLabel htmlFor="register-password">Password</FieldLabel>
            <PasswordField
              id="register-password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            {/* The live checklist says what is still missing, so the field
                error underneath would only repeat it. */}
            {password ? (
              <PasswordStrengthMeter value={password} />
            ) : (
              <FieldError errors={[errors.password]} />
            )}
          </Field>

          <Field data-invalid={Boolean(errors.confirmPassword)}>
            <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
            <PasswordField
              id="confirmPassword"
              placeholder="Type it again"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register("confirmPassword")}
            />
            <FieldError errors={[errors.confirmPassword]} />
          </Field>

          <Button
            type="submit"
            className={AUTH_BUTTON}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner /> : null}
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>
        </FieldGroup>
      </form>

      <SocialSignIn label="Or sign up with" />
    </div>
  );
}

/**
 * The response is identical whether or not the address was already taken, so
 * this copy has to work for both. Never say an address is available.
 */
function CheckYourInbox({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2 text-sm">
        <p className="font-medium">Check your inbox</p>
        <p className="text-muted-foreground">
          If that address can be signed up, a confirmation link is on its way to{" "}
          <span className="font-medium text-foreground">{email}</span>. The link
          is valid for 10 minutes, and your account is created when you open it.
        </p>
      </div>

      <ResendVerificationForm email={email} label="Send the link again" />

      <p className="text-sm text-muted-foreground">
        Already confirmed?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
