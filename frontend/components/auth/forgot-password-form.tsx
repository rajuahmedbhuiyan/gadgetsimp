"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authApi } from "@/lib/api/auth";
import { applyApiFieldErrors, errorMessage } from "@/lib/auth/errors";
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
  });

  const {
    register,
    handleSubmit,
    setError,
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
      applyApiFieldErrors(error, setError, ["email"]);
      setFormError(errorMessage(error));
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4 text-sm">
        <p>
          If that address has an account, a reset link is on its way. It is
          valid for 10 minutes and can be used once.
        </p>
        <p className="text-muted-foreground">
          <Link href="/login" className="underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
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
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              autoFocus
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : null}
            Email me a reset link
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
