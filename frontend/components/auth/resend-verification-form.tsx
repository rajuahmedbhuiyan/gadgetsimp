"use client";

import { useState } from "react";
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
import { AuthInput } from "@/components/auth/controls";
import { Spinner } from "@/components/ui/spinner";
import { authApi } from "@/lib/api/auth";
import { errorMessage } from "@/lib/auth/errors";
import {
  emailOnlySchema,
  type EmailOnlyData,
  type EmailOnlyValues,
} from "@/lib/auth/schemas";

/**
 * A fresh confirmation link. Answers 200 whether or not a pending signup
 * exists, so this never says anything about the address.
 *
 * `RESEND_COOLDOWN` (one per 60 seconds) and `RESEND_LIMIT_REACHED` (5 per
 * signup) are the two failures worth showing - the server's own message names
 * the remaining seconds, so it is shown verbatim.
 */
export function ResendVerificationForm({
  email,
  label = "Resend the link",
}: {
  /** Known already after signup; asked for when a link expired. */
  email?: string;
  label?: string;
}) {
  const [sent, setSent] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const form = useForm<EmailOnlyValues, unknown, EmailOnlyData>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: email ?? "" },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit(values: EmailOnlyData) {
    setSent(null);
    setFailure(null);
    try {
      const response = await authApi.resendVerification(values.email);
      setSent(response.message);
    } catch (error) {
      setFailure(errorMessage(error));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {sent ? <FormAlert message={sent} tone="info" /> : null}
      {failure ? <FormAlert message={failure} /> : null}

      <FieldGroup>
        {email ? (
          <input type="hidden" {...register("email")} />
        ) : (
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="resend-email">Email</FieldLabel>
            <AuthInput
              id="resend-email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>
        )}

        <Button
          type="submit"
          variant="outline"
          className="h-11 w-full cursor-pointer gap-2 text-sm font-medium"
          disabled={isSubmitting}
        >
          {isSubmitting ? <Spinner /> : null}
          {label}
        </Button>
      </FieldGroup>
    </form>
  );
}
