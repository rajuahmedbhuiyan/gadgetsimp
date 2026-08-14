"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { AUTH_BUTTON, AuthInput } from "@/components/auth/controls";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authApi } from "@/lib/api/auth";
import { errorMessage } from "@/lib/auth/errors";
import {
  emailOnlySchema,
  type EmailOnlyData,
  type EmailOnlyValues,
} from "@/lib/auth/schemas";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<EmailOnlyValues, unknown, EmailOnlyData>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: "" },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit(values: EmailOnlyData) {
    setFormError(null);
    try {
      await authApi.forgotPassword(values.email);
      // 200 even for an address with no account. Never render "no account
      // found" - that would turn this form into an address oracle.
      setSent(true);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  if (sent) {
    return (
      <div>
        <FormAlert message="Check your inbox" tone="success">
          If that address has an account, a reset link is on its way. It is
          valid for 10 minutes and can be used once.
        </FormAlert>
        <Link
          href="/login"
          className="text-sm font-medium underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      {formError ? <FormAlert message={formError} /> : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
            <AuthInput
              id="forgot-email"
              type="email"
              inputMode="email"
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>

          <Button
            type="submit"
            className={AUTH_BUTTON}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner /> : null}
            {isSubmitting ? "Sending…" : "Email me a reset link"}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
