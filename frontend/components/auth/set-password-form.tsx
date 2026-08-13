"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authApi } from "@/lib/api/auth";
import type { PendingRegistration } from "@/lib/api/auth";
import { applyApiFieldErrors, errorMessage } from "@/lib/auth/errors";
import {
  setPasswordSchema,
  type SetPasswordData,
  type SetPasswordValues,
} from "@/lib/auth/schemas";

/**
 * Step 3 of a checkout signup.
 *
 * The token posted here is the `registrationToken` from `/auth/verify-email`,
 * never the one from the email - that one was spent and rotated away, and
 * sending it returns `REGISTRATION_TOKEN_INVALID`. Window is 30 minutes.
 */
export function SetPasswordForm({
  registration,
}: {
  registration: PendingRegistration;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<SetPasswordValues, unknown, SetPasswordData>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit(values: SetPasswordData) {
    setFormError(null);
    try {
      await authApi.completeRegistration(
        registration.registrationToken,
        values.password,
      );
      router.replace("/");
    } catch (error) {
      applyApiFieldErrors(error, setError, ["password"]);
      setFormError(errorMessage(error));
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        {registration.email} is confirmed. Choose a password to finish creating
        the account
        {registration.fullName ? ` for ${registration.fullName}` : ""}.
      </p>

      {formError ? <FormAlert message={formError} /> : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.password)}>
            <FieldLabel htmlFor="new-account-password">Password</FieldLabel>
            <Input
              id="new-account-password"
              type="password"
              autoComplete="new-password"
              autoFocus
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <FieldDescription>
              At least 8 characters, with an uppercase letter, a lowercase
              letter and a number.
            </FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>

          <Field data-invalid={Boolean(errors.confirmPassword)}>
            <FieldLabel htmlFor="new-account-confirm">
              Confirm password
            </FieldLabel>
            <Input
              id="new-account-confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register("confirmPassword")}
            />
            <FieldError errors={[errors.confirmPassword]} />
          </Field>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : null}
            Finish signing up
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
