"use client";

import { useState } from "react";
import Link from "next/link";
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
import { applyApiFieldErrors, errorMessage } from "@/lib/auth/errors";
import {
  resetPasswordSchema,
  type ResetPasswordData,
  type ResetPasswordValues,
} from "@/lib/auth/schemas";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ResetPasswordValues, unknown, ResetPasswordData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit(values: ResetPasswordData) {
    if (!token) return;
    setFormError(null);
    try {
      await authApi.resetPassword(token, values.newPassword);
      // Every session was revoked and none was issued, so there is nothing to
      // sign in with here. Send them to login rather than faking a session.
      router.replace("/login?notice=password-reset");
    } catch (error) {
      applyApiFieldErrors(error, setError, ["newPassword"]);
      setFormError(errorMessage(error));
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert message="This reset link is missing its token." />
        <p className="text-sm text-muted-foreground">
          <Link href="/forgot-password" className="underline underline-offset-4">
            Request a new link
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
          <Field data-invalid={Boolean(errors.newPassword)}>
            <FieldLabel htmlFor="newPassword">New password</FieldLabel>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              autoFocus
              aria-invalid={Boolean(errors.newPassword)}
              {...register("newPassword")}
            />
            <FieldDescription>
              At least 8 characters, with an uppercase letter, a lowercase
              letter and a number.
            </FieldDescription>
            <FieldError errors={[errors.newPassword]} />
          </Field>

          <Field data-invalid={Boolean(errors.confirmPassword)}>
            <FieldLabel htmlFor="reset-confirm">Confirm password</FieldLabel>
            <Input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register("confirmPassword")}
            />
            <FieldError errors={[errors.confirmPassword]} />
          </Field>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : null}
            Set new password
          </Button>
        </FieldGroup>
      </form>

      <p className="mt-4 text-sm text-muted-foreground">
        Setting a password here also signs every device out.
      </p>
    </div>
  );
}
