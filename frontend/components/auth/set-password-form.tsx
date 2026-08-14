"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";

import {
  AUTH_BUTTON,
  PasswordField,
  PasswordStrengthMeter,
} from "@/components/auth/controls";
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
import type { PendingRegistration } from "@/lib/api/auth";
import { errorMessage } from "@/lib/auth/errors";
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
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  const password = useWatch({ control, name: "password" }) ?? "";

  async function onSubmit(values: SetPasswordData) {
    setFormError(null);
    try {
      await authApi.completeRegistration(
        registration.registrationToken,
        values.password,
      );
      router.replace("/");
    } catch (error) {
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
            <PasswordField
              id="new-account-password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              autoFocus
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            {password ? (
              <PasswordStrengthMeter value={password} />
            ) : (
              <FieldError errors={[errors.password]} />
            )}
          </Field>

          <Field data-invalid={Boolean(errors.confirmPassword)}>
            <FieldLabel htmlFor="new-account-confirm">
              Confirm password
            </FieldLabel>
            <PasswordField
              id="new-account-confirm"
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
            {isSubmitting ? "Finishing…" : "Finish signing up"}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
